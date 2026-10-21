#!/usr/bin/env python3
"""Read the controlled village workbook without modifying or evaluating it.

The source cells and their XML lexical values remain separate from normalized
game data. Formula strings are evidence only; no eval or Excel execution.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import posixpath
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
SHEETS = ['全局参数', '角色属性', '角色成长', '围栏等级', '怪物属性', '狼群波次',
          '武器制作', '战斗公式', '采集探索', '平衡检查', '使用说明']
NUMBER = re.compile(r'^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$')


def _compile_workbook(inputPath: str, outputDir: str) -> dict:
    """Return and persist a CompilationReport, including failed diagnostics."""
    source = Path(inputPath)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    diagnostics: list[dict] = []
    sheets: list[dict] = []
    source_map: dict = {}

    def problem(code, sheet, cell, message, related=None):
        item = dict(code=code, location=f'{sheet}!{cell}', message=message, severity='error')
        if related is not None:
            item['related'] = related
        diagnostics.append(item)

    with zipfile.ZipFile(source) as archive:
        if sum(i.file_size for i in archive.infolist()) > 20_000_000:
            raise ValueError('Workbook exceeds controlled-source size budget')
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            shared = [''.join(t.text or '' for t in item.findall('.//s:t', NS))
                      for item in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('s:si', NS)]
        workbook = ET.fromstring(archive.read('xl/workbook.xml'))
        relationships = {r.attrib['Id']: r.attrib['Target'] for r in
                         ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        for item in workbook.findall('s:sheets/s:sheet', NS):
            name = item.attrib['name']
            target = relationships[item.attrib[f'{{{REL}}}id']]
            member = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
            if not member.startswith('xl/worksheets/') or '..' in member.split('/'):
                raise ValueError('Invalid worksheet relationship')
            xml = ET.fromstring(archive.read(member))
            cells = {}
            for cell in xml.findall('s:sheetData/s:row/s:c', NS):
                ref, kind = cell.attrib['r'], cell.attrib.get('t', 'n')
                value = cell.find('s:v', NS)
                lexical = value.text if value is not None and value.text is not None else None
                formula = cell.find('s:f', NS)
                if kind == 's':
                    value, cell_type = shared[int(lexical)], 'text'
                elif kind == 'inlineStr':
                    value = ''.join(t.text or '' for t in cell.findall('s:is//s:t', NS))
                    cell_type = 'text'
                elif kind in ('str', 'e', 'd'):
                    value, cell_type = lexical, {'e': 'error', 'd': 'date'}.get(kind, 'text')
                elif kind == 'b':
                    value, cell_type = lexical == '1', 'boolean'
                elif lexical is None:
                    value, cell_type = None, 'blank'
                else:
                    value = float(lexical)
                    if not math.isfinite(value):
                        raise ValueError(f'{name}!{ref}: Nonfinite source value')
                    value = int(value) if value.is_integer() else value
                    cell_type = 'number'
                raw = dict(type=cell_type, value=value, rawText=lexical, xmlType=kind)
                if formula is not None:
                    raw['formula'] = formula.text or ''
                cells[ref] = raw
            sheets.append(dict(name=name, dimension=xml.find('s:dimension', NS).attrib.get('ref')
                               if xml.find('s:dimension', NS) is not None else None, cells=cells))
    by_name = {s['name']: s['cells'] for s in sheets}
    if [s['name'] for s in sheets] != SHEETS:
        problem('worksheet_contract', 'workbook', 'sheets', 'Expected the 11 controlled sheets in source order')

    def cell(sheet, ref):
        return by_name.get(sheet, {}).get(ref, {}).get('value')

    def text(sheet, ref, output_key):
        value = cell(sheet, ref)
        if not isinstance(value, str) or not value.strip():
            problem('invalid_text', sheet, ref, 'Nonempty text required')
            return ''
        source_map[output_key] = dict(sheet=sheet, cells=[ref], rawValue=value,
                                      effectiveValue=value, classification='source')
        return value

    def number(sheet, ref, output_key, *, minimum=0, probability=False, integer=False):
        raw = cell(sheet, ref)
        valid = not isinstance(raw, bool) and (isinstance(raw, (float, int)) or
                 isinstance(raw, str) and NUMBER.fullmatch(raw.strip()) is not None)
        value = float(raw) if valid else None
        if value is None or not math.isfinite(value):
            problem('invalid_number', sheet, ref, 'Strict finite number required')
            return None
        if probability and not 0 <= value <= 1:
            problem('probability_out_of_range', sheet, ref, 'Probability must be in [0,1]')
        elif minimum is not None and value < minimum:
            problem('number_out_of_range', sheet, ref, f'Minimum is {minimum}')
        if integer and not value.is_integer():
            problem('invalid_integer', sheet, ref, 'Integer required')
        value = int(value) if value.is_integer() else value
        source_map[output_key] = dict(sheet=sheet, cells=[ref], rawValue=raw,
                                      effectiveValue=value, classification='source')
        return value

    def records(sheet, first, last, pattern):
        seen = {}
        for row in range(first, last + 1):
            value = cell(sheet, f'A{row}')
            if not isinstance(value, str) or re.fullmatch(pattern, value) is None:
                problem('invalid_id', sheet, f'A{row}', 'Stable source ID required')
                continue
            if value in seen:
                problem('duplicate_id', sheet, f'A{row}', f'Duplicate {value}', [f'{sheet}!A{seen[value]}'])
            seen[value] = row
            yield row, value

    globals_ = {}
    for row, identifier in records('全局参数', 2, 15, r'[A-Z][A-Z0-9_]+'):
        globals_[identifier] = number('全局参数', f'C{row}', f'globals.{identifier}',
                                     probability=identifier in ('BASE_DEF_REDUCTION_CAP', 'HIT_RATE', 'CRIT_RATE_BASE', 'EXPLORE_RISK_BASE'))
    actors = []
    for row, identifier in records('角色属性', 3, 13, r'(?:P|H|W)\d{3}'):
        key = f'actors.{identifier}'
        actor = dict(id=identifier, name=text('角色属性', f'B{row}', key + '.name'),
                     kind={'P': 'player', 'H': 'hero', 'W': 'wanderer'}[identifier[0]],
                     acquisition=text('角色属性', f'D{row}', key + '.acquisition'))
        for column, field in zip('EFGHIJKLMNOP', ['hp', 'attack', 'defense', 'attackSpeed', 'range', 'hitRate',
                                                     'critRate', 'critMultiplier', 'gather', 'explore', 'craft', 'moveSpeed']):
            actor[field] = number('角色属性', f'{column}{row}', f'{key}.{field}', probability=field in ('hitRate', 'critRate'))
        actor['note'] = text('角色属性', f'Q{row}', key + '.note')
        actors.append(actor)
    wolves = []
    for row, identifier in records('怪物属性', 3, 9, r'M\d{3}'):
        key = f'wolves.{identifier}'
        wolf = dict(id=identifier, name=text('怪物属性', f'B{row}', key + '.name'),
                    targetPreference=text('怪物属性', f'L{row}', key + '.targetPreference'))
        for column, field in zip('DEFGHIJK', ['hp', 'attack', 'defense', 'attackSpeed', 'hitRate', 'critRate', 'critMultiplier', 'moveSpeed']):
            wolf[field] = number('怪物属性', f'{column}{row}', f'{key}.{field}', probability=field in ('hitRate', 'critRate'))
        wolf['drops'] = {resource: number('怪物属性', f'{col}{row}', f'{key}.drops.{resource}', integer=True)
                         for col, resource in zip('MNO', ['wood', 'stone', 'meat'])}
        wolves.append(wolf)
    weapons = []
    for column, resource, accepted in [('G', 'wood', ('木材成本', '木材数量')), ('H', 'stone', ('石头成本', '石头数量')),
                                      ('I', 'rope', ('麻绳成本', '麻绳数量'))]:
        for row in (1, 2):
            if cell('武器制作', f'{column}{row}') not in accepted:
                problem('unknown_recipe_reference', '武器制作', f'{column}{row}', f'Unknown recipe resource; expected {resource}')
    for row, identifier in records('武器制作', 3, 8, r'WPN\d{3}'):
        key = f'weapons.{identifier}'
        weapon = dict(id=identifier, name=text('武器制作', f'B{row}', key + '.name'),
                      kind=text('武器制作', f'C{row}', key + '.kind'),
                      note=text('武器制作', f'K{row}', key + '.note'))
        for column, field in [('D', 'attack'), ('E', 'attackSpeedModifier'), ('F', 'range'), ('J', 'workSeconds')]:
            weapon[field] = number('武器制作', f'{column}{row}', f'{key}.{field}', minimum=None if column == 'E' else 0)
        weapon['cost'] = {resource: number('武器制作', f'{col}{row}', f'{key}.cost.{resource}', integer=True)
                          for col, resource in zip('GHI', ['wood', 'stone', 'rope'])}
        weapons.append(weapon)
    fences = []
    for row in range(3, 13):
        key = f'fences.{row - 2}'
        fences.append(dict(level=number('围栏等级', f'A{row}', key + '.level', minimum=1, integer=True),
                           hp=number('围栏等级', f'B{row}', key + '.hp'), defense=number('围栏等级', f'C{row}', key + '.defense'),
                           cost={r: number('围栏等级', f'{c}{row}', f'{key}.cost.{r}', integer=True) for c, r in zip('DE', ['wood', 'stone'])},
                           repairCost={r: number('围栏等级', f'{c}{row}', f'{key}.repairCost.{r}', integer=True) for c, r in zip('FG', ['wood', 'stone'])}))
        if fences[-1]['level'] != row - 2:
            problem('invalid_fence_level', '围栏等级', f'A{row}', 'Expected the unique ordered levels 1..10')
    waves = []
    wave_ids = {}
    previous_day = 0
    wolf_ids = {w['id'] for w in wolves}
    # Wave columns are NOT in monster-ID order: the leader is the last column.
    wolf_names = {w['name']: w['id'] for w in wolves}
    wave_columns = {}
    for col in 'DEFGHIJ':
        label = str(cell('狼群波次', f'{col}1')).removesuffix('数量')
        identifier = wolf_names.get(label)
        if identifier is None:
            problem('unknown_wolf_reference', '狼群波次', f'{col}1', 'Unknown wave column monster name')
        else:
            wave_columns[col] = identifier
    for row in range(3, 13):
        key = f'waves.{row - 2}'
        wave = dict(id=number('狼群波次', f'A{row}', key + '.id', minimum=1, integer=True),
                    day=number('狼群波次', f'B{row}', key + '.day', minimum=1, integer=True),
                    threat=number('狼群波次', f'C{row}', key + '.threat'),
                    counts={identifier: number('狼群波次', f'{c}{row}', f'{key}.counts.{identifier}', integer=True)
                            for c, identifier in wave_columns.items()},
                    total=number('狼群波次', f'K{row}', key + '.total', integer=True))
        if all(v is not None for v in wave['counts'].values()) and sum(wave['counts'].values()) != wave['total']:
            problem('wave_total_mismatch', '狼群波次', f'K{row}', 'Total differs from individual wolf counts')
        if wave['id'] in wave_ids:
            problem('duplicate_id', '狼群波次', f'A{row}', 'Duplicate wave ID', [f"狼群波次!A{wave_ids[wave['id']]}"])
        wave_ids[wave['id']] = row
        if wave['id'] != row - 2:
            problem('invalid_wave_id', '狼群波次', f'A{row}', 'Expected unique ordered wave IDs 1..10')
        if wave['day'] is not None:
            if wave['day'] <= previous_day:
                problem('invalid_wave_order', '狼群波次', f'B{row}', 'Wave days must be positive and strictly increasing')
            previous_day = wave['day']
        for i, col in enumerate('DEFGHIJ', 1):
            if f'M{i:03}' not in wolf_ids:
                problem('unknown_wolf_reference', '狼群波次', f'{col}{row}', f'Unknown wolf M{i:03}')
        waves.append(wave)
    nodes = []
    for resource, start in [('wood', 3), ('stone', 14), ('rope', 25)]:
        for level in range(1, 11):
            row, identifier = start + level - 1, f'{resource}_{level}'
            key = f'nodes.{identifier}'
            if cell('采集探索', f'A{row}') != f'{level}级':
                problem('invalid_node_level', '采集探索', f'A{row}', f'Expected {level}级')
            nodes.append(dict(id=identifier, resource=resource, level=level,
                              hp=number('采集探索', f'B{row}', key + '.hp'),
                              yield_=number('采集探索', f'C{row}', key + '.yield', integer=True)))
            nodes[-1]['yield'] = nodes[-1].pop('yield_')
    counts = dict(players=sum(a['kind'] == 'player' for a in actors), heroes=sum(a['kind'] == 'hero' for a in actors),
                  wanderers=sum(a['kind'] == 'wanderer' for a in actors), wolves=len(wolves), weapons=len(weapons),
                  fences=len(fences), nodes=len(nodes), waves=len(waves))
    report = dict(schemaVersion=1, inputHash=digest, sourceFile=source.name, counts=counts,
                  ok=not diagnostics, diagnostics=diagnostics)
    raw = dict(schemaVersion=1, inputHash=digest, sheets=sheets, sourceMap=source_map,
               tables=dict(globals=globals_, actors=actors, wolves=wolves, weapons=weapons,
                           fences=fences, waves=waves, nodes=nodes), diagnostics=diagnostics)
    output = Path(outputDir)
    output.mkdir(parents=True, exist_ok=True)
    for filename, value in [('raw.json', raw), ('report.json', report)]:
        (output / filename).write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    return report


def compileWorkbook(inputPath: str, outputDir: str) -> dict:
    """Parsing failures are machine-readable failures, never successful imports."""
    try:
        return _compile_workbook(inputPath, outputDir)
    except (zipfile.BadZipFile, ET.ParseError, ValueError, KeyError, IndexError) as error:
        source = Path(inputPath)
        report = dict(schemaVersion=1, inputHash=hashlib.sha256(source.read_bytes()).hexdigest(),
                      sourceFile=source.name, ok=False, counts={}, diagnostics=[dict(
                          code='workbook_parse_error', location=f'{source.name}!workbook',
                          message=str(error), severity='error')])
        output = Path(outputDir)
        output.mkdir(parents=True, exist_ok=True)
        (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        return report


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    result = compileWorkbook(args.input, args.output)
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0 if result['ok'] else 2)

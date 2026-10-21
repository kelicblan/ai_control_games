"""Create isolated malformed inputs for the read-only source importer tests."""
import json
import sys
import xml.etree.ElementTree as ET
import zipfile

NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
source, destination, changes = sys.argv[1:]
changes = json.loads(changes)
with zipfile.ZipFile(source) as original, zipfile.ZipFile(destination, 'w') as output:
    for entry in original.infolist():
        data = original.read(entry.filename)
        for change in changes:
            if entry.filename != f"xl/worksheets/sheet{change['sheet']}.xml":
                continue
            root = ET.fromstring(data)
            cell = root.find(f".//{{{NS}}}c[@r='{change['cell']}']")
            if cell is None:
                raise ValueError('Fixture cell does not exist')
            for child in list(cell):
                cell.remove(child)
            value = change['value']
            if isinstance(value, str):
                cell.set('t', 'inlineStr')
                ET.SubElement(ET.SubElement(cell, f'{{{NS}}}is'), f'{{{NS}}}t').text = value
            else:
                cell.attrib.pop('t', None)
                ET.SubElement(cell, f'{{{NS}}}v').text = str(value)
            data = ET.tostring(root, encoding='utf-8', xml_declaration=True)
        output.writestr(entry, data)

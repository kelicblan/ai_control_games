import raw from './raw-v2.json';
/** The workbook category is source evidence, not inferred from ID ordering. */
export function isEliteWolf(id: string) {
  const sheet=raw.sheets.find(s=>s.name==='怪物属性')!;
  const cells:Record<string,{value:unknown}|undefined>=sheet.cells;
  const row=Object.keys(cells).find(key=>/^A\d+$/.test(key)&&cells[key]?.value===id)?.slice(1);
  return !!row&&cells[`C${row}`]?.value==='精英';
}

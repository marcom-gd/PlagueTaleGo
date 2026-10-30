"""Preserve native export objects and styles while inserting authored Excel formulas.

The authoring engine cannot cache HYPERLINK results. Keep Google's verified
display caches and all original XML features instead of round-tripping objects.
"""
import pathlib, zipfile, re, xml.etree.ElementTree as ET
from xml.sax.saxutils import escape
root=pathlib.Path(__file__).resolve().parent.parent
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
gids={'2030192770':'Gameplay Elements','1043638815':'Placements','214776623':'Element Parts','714642317':'Atoms'}
count=0
with zipfile.ZipFile(root/'support/latest-example-export.xlsx') as source, zipfile.ZipFile(root/'support/latest-example-compatible.xlsx') as authored, zipfile.ZipFile(root/'workshop-inventory-example.xlsx','w',zipfile.ZIP_DEFLATED) as dest:
 for info in source.infolist():
  data=source.read(info.filename)
  if re.fullmatch(r'xl/worksheets/sheet\d+\.xml',info.filename):
   formulas={c.get('r'):c.findtext('s:f',namespaces=ns) for c in ET.fromstring(authored.read(info.filename)).findall('.//s:c',ns)}
   text=data.decode('utf-8')
   def cell(match):
    global count
    xml=match.group(0); address=match.group(1)
    f=re.search(r'<f(?:\s[^>]*)?>(.*?)</f>',xml,re.S)
    if not f: return xml
    if '__xludf' in f.group(1) or '#gid=' in f.group(1):
     formula=formulas[address]
     assert formula and '__xludf' not in formula and '#gid=' not in formula,(info.filename,address)
     assert len(formula)<8192
     count+=1
     return xml[:f.start()]+'<f>'+escape(formula)+'</f>'+xml[f.end():]
    return xml
   text=re.sub(r'<c\b[^>]*\br="([A-Z]+\d+)"[^>]*(?<!/)>.*?</c>',cell,text,flags=re.S)
   for gid,name in gids.items():
    text=text.replace(f'#gid={gid}&amp;range=',f"#'{name}'!")
   assert '__xludf' not in text
   data=text.encode('utf-8')
  dest.writestr(info,data)
assert count>800,count
with zipfile.ZipFile(root/'workshop-inventory-example.xlsx') as final:
 for name in final.namelist():
  if name.endswith('.xml'):
   r=ET.fromstring(final.read(name))
   assert not r.findall('.//s:c[@t="e"]',ns),name
 print(f'Preserved original features; replaced {count} incompatible/link formulas; no cached formula errors.')

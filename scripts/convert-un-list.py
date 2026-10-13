#!/usr/bin/env python3
"""Convert an official, locally downloaded UN consolidated XML list to workspace JSON.
No network request, account, billing, or third-party dependencies.
"""
import argparse
import json
from pathlib import Path
import xml.etree.ElementTree as ET

SOURCE = 'https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list'

def convert(xml):
    if len(xml) > 20 * 1024 * 1024:
        raise ValueError('XML exceeds 20 MB')
    if b'<!DOCTYPE' in xml.upper() or b'<!ENTITY' in xml.upper():
        raise ValueError('DTD/entity declarations are not supported')
    root = ET.fromstring(xml)
    records = []
    for element in list(root.findall('./INDIVIDUALS/INDIVIDUAL')) + list(root.findall('./ENTITIES/ENTITY')):
        name = ' '.join(element.findtext(key, '').strip() for key in ['FIRST_NAME', 'SECOND_NAME', 'THIRD_NAME', 'FOURTH_NAME']).strip()
        reference = element.findtext('REFERENCE_NUMBER') or element.findtext('DATAID')
        if not reference or not name:
            raise ValueError('List entry missing name or reference')
        aliases = [a.text.strip() for a in element.findall('.//ALIAS_NAME') if a.text and a.text.strip()]
        dates = [d.text.strip() for d in element.findall('.//DATE_OF_BIRTH') if d.text and d.text.strip()]
        records.append({'id': f'UN:{reference}', 'name': name, 'aliases': aliases, 'kind': 'sanction', 'source': 'UN Security Council consolidated list', 'sourceUrl': SOURCE, 'listedAt': element.findtext('LISTED_ON', ''), 'dob': dates[0] if len(dates) == 1 else '', 'identifier': '', 'unReference': reference, 'snapshotDate': root.attrib.get('dateGenerated', '')})
    if not records:
        raise ValueError('No UN sanctions entries found; verify the input format')
    return records

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    records = convert(args.input.read_bytes())
    args.output.write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n')
    print(f'Converted {len(records)} entries to {args.output}. Identity review is still required.')

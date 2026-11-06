"""Extract audit inputs without credentials, Windows environments or partial partitions."""
from pathlib import Path,PurePosixPath
from zipfile import ZipFile
import argparse,json,shutil
ROOT=Path(__file__).resolve().parent
p=argparse.ArgumentParser(description=__doc__);p.add_argument('archive',type=Path);p.add_argument('--include-li-large',action='store_true',help='Also extract the 7.35 GB standardized file for footer inspection');a=p.parse_args()
base='acurion_milestone1/acurion_starter/'
allowed_extensions={'.py','.bak','.json','.npz','.pt','.joblib','.pkl','.txt','.md','.csv'}
manifest=[];destination=ROOT/'source';destination.mkdir(exist_ok=True)
with ZipFile(a.archive) as z:
 for info in z.infolist():
  if not info.filename.startswith(base) or info.is_dir():continue
  relative=PurePosixPath(info.filename[len(base):]);path=str(relative)
  if '..' in relative.parts or relative.is_absolute():raise ValueError('Unsafe archive path')
  sensitive=any(x in path.lower() for x in ['service-account','service_account','credential','private_key'])
  if '.venv' in relative.parts or 'site-packages' in relative.parts:continue
  manifest.append({'path':path,'bytes':info.file_size,'crc':info.CRC,'excluded_sensitive':sensitive})
  if sensitive or 'LI-Large_daily_parts_incomplete' in relative.parts:continue
  big=path in ['ml_data/HI-Small_features.parquet','ml_data/LI-Large_standardized_full.parquet']
  wanted=(info.file_size<100_000_000 and relative.suffix.lower() in allowed_extensions) or path=='ml_data/HI-Small_features.parquet' or (a.include_li_large and path=='ml_data/LI-Large_standardized_full.parquet')
  if not wanted:continue
  target=destination/relative
  if target.exists():
   if target.stat().st_size!=info.file_size:raise ValueError('Existing size differs: '+path)
   continue
  target.parent.mkdir(parents=True,exist_ok=True)
  with z.open(info) as src,target.open('wb') as dst:shutil.copyfileobj(src,dst,4*1024*1024)
results=ROOT/'results';results.mkdir(exist_ok=True);(results/'archive_manifest.json').write_text(json.dumps(manifest,indent=2))
print('Extracted allowed inputs. Credentials and incomplete partitions excluded.')

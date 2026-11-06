"""Bounded raw IBM CSV -> standardized Parquet -> full-history feature Parquet.

Uses preserved original builders, explicit account metadata and a new destination.
Other dataset families may be standardized by the original adapter, but are not
silently passed to the IBM-trained temporal model.
"""
import argparse,json,subprocess,sys
from pathlib import Path
import pyarrow as pa
import pyarrow.csv as pcsv
import pyarrow.parquet as pq
import duckdb
ROOT=Path(__file__).resolve().parent

def prepare(raw,accounts,dataset,output,assets,max_rows):
 if output.exists():raise FileExistsError('Output directory already exists')
 if not accounts.is_file():raise FileNotFoundError('Matching Bank ID / Account Number / Entity ID metadata is required')
 con=duckdb.connect();con.execute("SET memory_limit='2GB'");con.execute('SET threads=2')
 count=con.execute('SELECT count(*) FROM read_csv(?,all_varchar=true)',[str(raw)]).fetchone()[0];con.close()
 if count>max_rows:raise ValueError(f'{count:,} rows exceeds max-input-rows={max_rows:,}. Full-history state is not bounded by chunk size')
 output.mkdir(parents=True)
 def call(script,*args):subprocess.run([sys.executable,str((assets/script).resolve()),*map(str,args)],cwd=output,check=True)
 standard=(output/'standardized.parquet').resolve();features=(output/'features.csv').resolve()
 call('standardize_data.py','--input',raw.resolve(),'--output',standard,'--dataset-type','ibm_aml','--dataset-id',dataset)
 call('prepare_full_history.py','--standardized-input',standard,'--accounts-file',accounts.resolve(),'--dataset',dataset,'--output',features)
 # Force identifier types so numeric-looking account numbers retain leading zeroes.
 identifiers=['sender_bank','sender_account','receiver_bank','receiver_account','event_timestamp','dataset','dataset_id','transaction_id']
 options=pcsv.ConvertOptions(column_types={c:pa.string() for c in identifiers})
 reader=pcsv.open_csv(features,convert_options=options);writer=pq.ParquetWriter(output/'features.parquet',reader.schema,compression='zstd')
 try:
  for batch in reader:writer.write_batch(batch)
 finally:writer.close()
 (output/'preparation.json').write_text(json.dumps({'datasetId':dataset,'inputRows':count,'sourceRowConvention':'one-based raw input order','history':'All supplied input history before each event; same-time transactions excluded','warning':'Synthetic fixture validates plumbing only. New real data still needs independent evaluation. No account records were invented by this tool.'},indent=2))
 return output/'features.parquet'

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--input',type=Path,required=True);p.add_argument('--accounts',type=Path,required=True);p.add_argument('--dataset-id',required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--assets',type=Path,default=ROOT/'source');p.add_argument('--max-input-rows',type=int,default=1000000);a=p.parse_args()
 print(prepare(a.input,a.accounts,a.dataset_id,a.output,a.assets,a.max_input_rows))

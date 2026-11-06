"""Generate openly synthetic IBM-shaped input to test fresh-file plumbing only."""
from pathlib import Path
import pandas as pd
P=Path(__file__).resolve().parents[1]/'results/fresh_fixture';P.mkdir(parents=True,exist_ok=True)
rows=[]
for i in range(240):
 s=i%12;d=(i+1)%12
 rows.append({'Timestamp':(pd.Timestamp('2022-09-09')+pd.Timedelta(minutes=i)).strftime('%Y/%m/%d %H:%M'),'From Bank':str(s%3+1),'Account':f'A{s:03}','To Bank':str(d%3+1),'Account.1':f'A{d:03}','Amount Paid':100.+i,'Amount Received':100.+i,'Payment Currency':'US Dollar','Receiving Currency':'US Dollar','Payment Format':'ACH','Is Laundering':0})
pd.DataFrame(rows).to_csv(P/'synthetic_transactions.csv',index=False)
pd.DataFrame([{'Bank ID':str(i%3+1),'Account Number':f'A{i:03}','Entity ID':f'SYNTHETIC_ENTITY_{i}'} for i in range(12)]).to_csv(P/'synthetic_accounts.csv',index=False)

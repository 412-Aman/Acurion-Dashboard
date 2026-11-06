"""Read checkpoint metadata with restricted loading; do not run training or upload data."""
from pathlib import Path
import sys,json,hashlib
import numpy as np
import torch
import pyarrow.parquet as pq
ROOT=Path(__file__).resolve().parent
S=ROOT/'source';R=ROOT/'results'
torch.set_num_threads(2)
result={}
for p in sorted((S/'models').glob('*.pt')):
 try:
  d=torch.load(p,map_location='cpu',weights_only=True)
  meta={k:v for k,v in d.items() if k not in ['state_dict','model_state_dict','optimizer_state_dict']}
  result[p.name]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'metadata':meta,'state_shapes':{k:list(v.shape) for k,v in d.get('state_dict',{}).items()}}
 except Exception as e:result[p.name]={'error':str(e)[:400]}
for p in sorted((S/'gnn_data').glob('*v[35]*.pt')):
 d=torch.load(p,map_location='cpu',weights_only=True)
 graphs=d.get('graphs',[])
 result[str(p.relative_to(S))]={'keys':list(d),'metadata':{k:v for k,v in d.items() if k!='graphs'},'graphs':len(graphs),'graph_keys':list(graphs[0]) if graphs else []}
p=S/'network_results/evaluation_only/independent_9day_graph_cache.pt'
d=torch.load(p,map_location='cpu',weights_only=True)
result['evaluation_cache']={'keys':list(d),'metadata':{k:v for k,v in d.items() if not isinstance(v,(list,dict,torch.Tensor))},'lengths':{k:len(v) for k,v in d.items() if isinstance(v,(list,dict,torch.Tensor))},'graph_keys':list(d['graphs'][0])}
with np.load(S/'models/gnn_v3_calibration.npz',allow_pickle=False) as z:
 result['npz']={k:{'shape':list(z[k].shape),'dtype':str(z[k].dtype)} for k in z.files}
(R/'artifact_metadata.json').write_text(json.dumps(result,indent=2,default=lambda v:v.tolist() if hasattr(v,'tolist') else str(v)))
for k,v in result.items():print(k,json.dumps(v,default=str)[:1100])

"""Exact tree contributions in raw model margin, not causal explanations."""
import numpy as np
from .temporal import NUMERIC

def feature_names(encoder):
 return NUMERIC+[f'{c} = {value}' for c,vocab in encoder.vocab.items() for value in vocab]

def tree_explanations(model,encoder,frame):
 import xgboost as xgb
 if not len(frame):return {}
 matrix=encoder.transform(frame)
 contrib=model.predict(xgb.DMatrix(matrix),pred_contribs=True)
 margin=model.predict(xgb.DMatrix(matrix),output_margin=True)
 if not np.allclose(contrib.sum(axis=1),margin,atol=1e-4):raise ValueError('Tree contributions do not sum to the model margin')
 names=feature_names(encoder);result={}
 for sid,row,values in zip(frame.source_row,contrib,matrix):
  top=np.argsort(-np.abs(row[:-1]))[:5]
  result[int(sid)]={'method':'XGBoost exact tree contributions','scale':'raw model margin (log odds), not percentage points','baseValue':float(row[-1]),'rawMargin':float(row.sum()),'topFeatures':[{'feature':names[j],'impact':float(row[j]),'encodedValue':float(values[j])} for j in top],'note':'Top five contributions only. Other contributions are omitted. Association in this model is not proof of a cause or of wrongdoing.'}
 return result

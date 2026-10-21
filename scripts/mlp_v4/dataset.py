"""Validate grouped executor data without training or changing its split."""
import hashlib,json,sys
def buildDataset(manifest,splitConfig):
    groups=[splitConfig[k] for k in ['trainSeeds','validationSeeds','testSeeds']]
    seeds=sum(groups,[])
    assert len(seeds)==len(set(seeds)),'Scenario seed groups overlap'
    assert manifest['head'] in ['life','tactical'] and manifest['engineHash'],'Missing head or engine provenance'
    seen=set();coverage={};split_counts={k:0 for k in ['train','validation','test']}
    for row in manifest['rows']:
        assert row['seed'] in seeds,'Unassigned seed'
        identity=(row['episodeId'],row['executionId'])
        assert identity not in seen,'Duplicate execution group'
        seen.add(identity)
        assert row['outcome']['status']=='completed' and row['outcome']['eventIds'],'Unproven positive row'
        inp=row['input'];index=row['chosenIndex']
        assert 0<=index<len(inp['candidates']) and inp['knownLegalMask'][index],'Illegal label'
        action=inp['candidates'][index]['action'];coverage[action]=coverage.get(action,0)+1
        for name,group in zip(split_counts,groups):
            if row['seed'] in group:split_counts[name]+=1
    return {'valid':True,'rows':len(seen),'coverage':coverage,'splits':split_counts,'sourceHash':manifest.get('sourceHash'),'datasetHash':hashlib.sha256(json.dumps(manifest,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'negativeTrajectories':len(manifest.get('failures',[]))}
if __name__=='__main__':
    with open(sys.argv[1],encoding='utf-8') as stream:data=json.load(stream)
    print(json.dumps(buildDataset(data,data)))

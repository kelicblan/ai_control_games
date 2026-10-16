using System;
using Newtonsoft.Json.Linq;

namespace CampMind.Presentation
{
    // Transport validation only; simulation rules remain in the authority.
    public sealed class BridgeSnapshotGate
    {
        public long Revision {get;private set;} = -1;
        public long Epoch {get;private set;}
        public string Scope {get;private set;}
        public JObject Snapshot {get;private set;}
        public void BeginMutation(){Epoch++;}
        public bool CanSendAction(string expectedScope)=>expectedScope==Scope;
        public bool Accept(JObject value,long requestEpoch)
        {
            if(requestEpoch!=Epoch)return false;
            var r=value?["revision"];
            if(r?.Type!=JTokenType.Integer || (long)r<0 || (long)r>9007199254740991L || value.Property("state")==null || (value["state"].Type!=JTokenType.Object&&value["state"].Type!=JTokenType.Null))throw new FormatException("Invalid world snapshot");
            var revision=(long)r;if(revision<Revision)return false;
            var scope=(string)value["dialogueScope"];
            if(value["state"].Type!=JTokenType.Null && (string.IsNullOrWhiteSpace(scope)||!scope.Contains(":")))throw new FormatException("Missing world generation/branch");
            if(Scope!=null&&scope!=Scope&&revision<=Revision)return false;
            Revision=revision;Scope=scope;Snapshot=value;return true;
        }
    }
}

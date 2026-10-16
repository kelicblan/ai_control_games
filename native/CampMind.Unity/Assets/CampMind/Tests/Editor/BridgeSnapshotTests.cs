using NUnit.Framework;
using Newtonsoft.Json.Linq;
using CampMind.Presentation;

namespace CampMind.Tests
{
    public class BridgeSnapshotTests
    {
        private static JObject Snapshot(long revision,string scope="generation:branch")=>new JObject{["revision"]=revision,["dialogueScope"]=scope,["state"]=new JObject{["status"]="playing"}};
        [Test]
        public void IgnoresOldResponsesAndRejectsInvalidAuthorityMetadata()
        {
            var gate=new BridgeSnapshotGate();
            Assert.That(gate.Accept(Snapshot(4),0),Is.True);
            Assert.That(gate.Accept(Snapshot(3),0),Is.False);
            gate.BeginMutation();
            Assert.That(gate.Accept(Snapshot(9),0),Is.False);
            Assert.That(gate.Accept(Snapshot(5),1),Is.True);
            Assert.Throws<System.FormatException>(()=>gate.Accept(Snapshot(6,""),1));
            var bad=Snapshot(6);bad["revision"]=1.5;
            Assert.Throws<System.FormatException>(()=>gate.Accept(bad,1));
            Assert.That(gate.Revision,Is.EqualTo(5));
        }
        [Test]
        public void ChangedWorldMustHaveNewerRevision()
        {
            var gate=new BridgeSnapshotGate();gate.Accept(Snapshot(8),0);
            Assert.That(gate.Accept(Snapshot(7,"new:branch"),0),Is.False);
            Assert.That(gate.Accept(Snapshot(9,"new:branch"),0),Is.True);
            Assert.That(gate.Scope,Is.EqualTo("new:branch"));
            Assert.That(gate.CanSendAction("generation:branch"),Is.False,"Queued actions from the old world must be dropped");
            Assert.That(gate.CanSendAction("new:branch"),Is.True);
        }
    }
}

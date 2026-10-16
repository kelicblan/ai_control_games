using CampMind.Presentation;
using NUnit.Framework;
using UnityEngine;

namespace CampMind.Tests
{
    public class GateViewTests
    {
        [Test]
        public void AuthorityGateStateControlsBothLeavesAndPreviewCollision()
        {
            var root=new GameObject("gate");var gate=root.AddComponent<NativeGateView>();
            gate.left=new GameObject("left").transform;gate.left.SetParent(root.transform);
            gate.right=new GameObject("right").transform;gate.right.SetParent(root.transform);
            gate.closedCollision=root.AddComponent<BoxCollider>();
            gate.Apply(false,1);Assert.That(gate.closedCollision.enabled,Is.True);Assert.That(Quaternion.Angle(gate.left.localRotation,Quaternion.identity),Is.LessThan(.01));
            gate.Apply(true,1);Assert.That(gate.closedCollision.enabled,Is.False);Assert.That(Quaternion.Angle(gate.left.localRotation,Quaternion.Euler(0,-90,0)),Is.LessThan(.1));
            Assert.That(Quaternion.Angle(gate.right.localRotation,Quaternion.Euler(0,90,0)),Is.LessThan(.1));
            Object.DestroyImmediate(root);
        }
    }
}

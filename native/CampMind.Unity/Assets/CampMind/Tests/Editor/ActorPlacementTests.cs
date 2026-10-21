using System.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEditor.SceneManagement;
using CampMind.Presentation;

namespace CampMind.Tests
{
    public class ActorPlacementTests
    {
        // Independent of BakeMesh: the bone/bindpose equation used by GPU skinning.
        public static float ActualSole(Transform actor)
        {
            float min=float.PositiveInfinity;
            foreach(var skin in actor.GetComponentsInChildren<SkinnedMeshRenderer>())
            {
                var vertices=skin.sharedMesh.vertices;var weights=skin.sharedMesh.boneWeights;var binds=skin.sharedMesh.bindposes;
                var matrices=skin.bones.Select((bone,i)=>bone.localToWorldMatrix*binds[i]).ToArray();
                for(int i=0;i<vertices.Length;i++)
                {
                    var w=weights[i];var p=matrices[w.boneIndex0].MultiplyPoint3x4(vertices[i])*w.weight0+matrices[w.boneIndex1].MultiplyPoint3x4(vertices[i])*w.weight1+matrices[w.boneIndex2].MultiplyPoint3x4(vertices[i])*w.weight2+matrices[w.boneIndex3].MultiplyPoint3x4(vertices[i])*w.weight3;
                    min=Mathf.Min(min,p.y);
                }
            }
            return min;
        }

        [TestCase(1,0)] [TestCase(-1,0)] [TestCase(0,1)] [TestCase(0,-1)]
        [TestCase(1,1)] [TestCase(-1,1)] [TestCase(1,-1)] [TestCase(-1,-1)]
        public void ShippedRigsFaceTheirMovementAndTouchTheSurface(float x,float z)
        {
            EditorSceneManager.OpenScene("Assets/CampMind/NewWorldGame/Camp.unity");
            var view=Object.FindFirstObjectByType<NativeCampView>();
            var floor=GameObject.CreatePrimitive(PrimitiveType.Cube);var roof=GameObject.CreatePrimitive(PrimitiveType.Cube);
            try
            {
                floor.layer=8;floor.transform.position=new Vector3(1000,.1f,1000);floor.transform.localScale=new Vector3(20,.4f,20);
                roof.layer=9;roof.transform.position=new Vector3(1000,4,1000);roof.transform.localScale=new Vector3(20,.2f,20);Physics.SyncTransforms();
                foreach(var actor in view.characters)
                {
                    actor.position=new Vector3(1000,.3f,1000);actor.rotation=Quaternion.Euler(0,73,0);
                    var animator=actor.GetComponentInChildren<Animator>();
                    foreach(var name in new[]{"Idle","Walk","WalkCarry"})
                    {
                        var clip=animator.runtimeAnimatorController.animationClips.FirstOrDefault(c=>c.name==name);if(!clip)continue;
                        foreach(var phase in new[]{0f,.125f,.25f,.5f,.75f})
                        {
                            clip.SampleAnimation(animator.gameObject,phase*clip.length);
                            var direction=new Vector3(x,0,z).normalized;NativeCampView.FaceMovement(actor,direction);view.GroundActor(actor);
                            var front=Vector3.ProjectOnPlane(animator.transform.TransformVector(Vector3.left),Vector3.up).normalized;
                            Assert.That(Vector3.Dot(front,direction),Is.GreaterThan(.999f),actor.name+" "+name+" "+phase);
                            Assert.That(ActualSole(actor),Is.EqualTo(.3f).Within(.004f),actor.name+" "+name+" "+phase+" must contact prop, ignore roof and follow animated feet");
                            Assert.That(view.ActorHead(actor).y,Is.GreaterThan(1.5f));
                        }
                    }
                }
            }
            finally {Object.DestroyImmediate(floor);Object.DestroyImmediate(roof);}
        }
    }
}

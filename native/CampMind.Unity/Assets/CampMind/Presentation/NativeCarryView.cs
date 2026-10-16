using UnityEngine;
namespace CampMind.Presentation
{
    // Source-authored tools follow the imported skeleton; inventory remains authoritative.
    public sealed class NativeCarryView : MonoBehaviour
    {
        public Transform leftHand,rightHand,axe,bundle,basket;
        public void SetActor(CampRenderFrame.Actor actor)
        {
            basket.gameObject.SetActive(actor.Alive&&actor.Food>0);
            bundle.gameObject.SetActive(actor.Alive&&actor.Wood>0&&actor.Food==0);
            axe.gameObject.SetActive(actor.Alive&&actor.Action=="wood");
        }
        void LateUpdate()=>RefreshPose();
        public void RefreshPose()
        {
            if(leftHand==null||rightHand==null)return;
            var center=(leftHand.position+rightHand.position)*.5f;
            var width=Vector3.Distance(leftHand.position,rightHand.position);
            Place(bundle,1.75f);Place(basket,1.3f);
            void Place(Transform item,float referenceWidth)
            {
                if(item==null||!item.gameObject.activeSelf)return;
                item.position=center;
                var parentScale=Mathf.Max(.001f,Mathf.Abs(item.parent.lossyScale.x));
                item.localScale=Vector3.one*Mathf.Max(.04f,width/(referenceWidth*parentScale));
            }
        }
    }
}

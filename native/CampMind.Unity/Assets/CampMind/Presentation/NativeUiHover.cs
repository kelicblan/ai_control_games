using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
namespace CampMind.Presentation
{
    public sealed class NativeUiHover:MonoBehaviour,IPointerEnterHandler,IPointerExitHandler,IPointerDownHandler,IPointerUpHandler
    {
        Image overlay;Button button;
        void Awake(){button=GetComponent<Button>();var go=new GameObject("悬停反馈",typeof(RectTransform),typeof(Image));go.transform.SetParent(transform,false);var r=(RectTransform)go.transform;r.anchorMin=Vector2.zero;r.anchorMax=Vector2.one;r.offsetMin=new Vector2(1,1);r.offsetMax=new Vector2(-1,-1);overlay=go.GetComponent<Image>();overlay.raycastTarget=false;overlay.color=Color.clear;}
        void Tint(float alpha){if(overlay!=null)overlay.color=button!=null&&button.interactable?new Color(1,.85f,.5f,alpha):Color.clear;}
        public void OnPointerEnter(PointerEventData data){Tint(.09f);}
        public void OnPointerExit(PointerEventData data){Tint(0);}
        public void OnPointerDown(PointerEventData data){Tint(.18f);}
        public void OnPointerUp(PointerEventData data){Tint(.09f);}
        void OnDisable(){Tint(0);}
    }
}

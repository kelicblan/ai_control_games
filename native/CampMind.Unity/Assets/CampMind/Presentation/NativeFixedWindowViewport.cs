using UnityEngine;
using UnityEngine.UI;
namespace CampMind.Presentation
{
    // Scroll the available window area; never rescale authored controls or text.
    public sealed class NativeFixedWindowViewport:MonoBehaviour
    {
        RectTransform content,viewport,canvas;ScrollRect scroll;Vector2 intrinsic,last;
        public static void Attach(RectTransform panel,RectTransform root){var fit=root.gameObject.AddComponent<NativeFixedWindowViewport>();fit.Initialize(panel,root);}
        void Initialize(RectTransform panel,RectTransform root){canvas=root;content=panel;intrinsic=panel.sizeDelta;
            var go=new GameObject("管理窗口可视区",typeof(RectTransform),typeof(Image),typeof(RectMask2D),typeof(ScrollRect));go.transform.SetParent(root,false);viewport=(RectTransform)go.transform;viewport.anchorMin=viewport.anchorMax=new Vector2(.5f,.5f);go.GetComponent<Image>().color=Color.clear;
            content.SetParent(viewport,false);content.anchorMin=content.anchorMax=new Vector2(0,1);content.pivot=new Vector2(0,1);content.sizeDelta=intrinsic;content.anchoredPosition=Vector2.zero;
            scroll=go.GetComponent<ScrollRect>();scroll.viewport=viewport;scroll.content=content;scroll.movementType=ScrollRect.MovementType.Clamped;scroll.scrollSensitivity=32;
            scroll.horizontalScrollbar=Bar(false);scroll.verticalScrollbar=Bar(true);scroll.horizontalScrollbarVisibility=scroll.verticalScrollbarVisibility=ScrollRect.ScrollbarVisibility.AutoHide;
        }
        Scrollbar Bar(bool vertical){var go=new GameObject(vertical?"管理纵向滚动条":"管理横向滚动条",typeof(RectTransform),typeof(Image),typeof(Scrollbar));go.transform.SetParent(viewport,false);var r=(RectTransform)go.transform;r.anchorMin=vertical?Vector2.right:Vector2.zero;r.anchorMax=vertical?Vector2.one:Vector2.right;r.pivot=vertical?Vector2.right:Vector2.zero;r.sizeDelta=vertical?new Vector2(10,-12):new Vector2(-12,10);r.anchoredPosition=vertical?new Vector2(-1,11):new Vector2(1,1);go.GetComponent<Image>().color=new Color(.06f,.13f,.1f,.9f);
            var thumb=new GameObject("滚动柄",typeof(RectTransform),typeof(Image));thumb.transform.SetParent(r,false);var h=(RectTransform)thumb.transform;h.anchorMin=Vector2.zero;h.anchorMax=Vector2.one;h.offsetMin=Vector2.zero;h.offsetMax=Vector2.zero;thumb.GetComponent<Image>().color=new Color(.67f,.59f,.35f,.9f);var bar=go.GetComponent<Scrollbar>();bar.handleRect=h;bar.targetGraphic=thumb.GetComponent<Image>();bar.direction=vertical?Scrollbar.Direction.BottomToTop:Scrollbar.Direction.LeftToRight;return bar;}
        void LateUpdate(){if(content==null)return;viewport.gameObject.SetActive(content.gameObject.activeSelf);if(!content.gameObject.activeSelf)return;
            var size=new Vector2(Mathf.Min(intrinsic.x,Mathf.Max(1,canvas.rect.width-32)),Mathf.Min(intrinsic.y,Mathf.Max(1,canvas.rect.height-32)));viewport.sizeDelta=size;var margin=(canvas.rect.size-size)/2-Vector2.one*16;viewport.anchoredPosition=new Vector2(Mathf.Clamp(canvas.rect.width*.034f,-Mathf.Max(0,margin.x),Mathf.Max(0,margin.x)),Mathf.Clamp(-canvas.rect.height*.009f,-Mathf.Max(0,margin.y),Mathf.Max(0,margin.y)));
            scroll.horizontal=size.x<intrinsic.x;scroll.vertical=size.y<intrinsic.y;if(Vector2.Distance(size,last)>.1f){scroll.normalizedPosition=new Vector2(0,1);last=size;}
            scroll.horizontalScrollbar.transform.SetAsLastSibling();scroll.verticalScrollbar.transform.SetAsLastSibling();
        }
    }
}

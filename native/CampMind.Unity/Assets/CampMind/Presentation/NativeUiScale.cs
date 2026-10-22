using UnityEngine.UI;
namespace CampMind.Presentation
{
    // Verified legacy fullscreen: 2880px / 1920 design pixels. Lock this accepted size across window resizes.
    public static class NativeUiScale
    {
        public const float Factor=2880f/1920f;
        public static void Configure(CanvasScaler scaler){scaler.uiScaleMode=CanvasScaler.ScaleMode.ConstantPixelSize;scaler.scaleFactor=Factor;}
    }
}

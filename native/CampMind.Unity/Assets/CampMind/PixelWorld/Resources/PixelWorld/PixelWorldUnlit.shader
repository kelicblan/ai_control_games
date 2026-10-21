Shader "CampMind/PixelWorldUnlit"
{
    Properties { [PerRendererData] _MainTex("Sprite",2D)="white"{} }
    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "Queue"="Transparent" "RenderType"="Transparent" "CanUseSpriteAtlas"="True" }
        Cull Off ZWrite Off Blend SrcAlpha OneMinusSrcAlpha
        Pass
        {
            Tags { "LightMode"="UniversalForward" }
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            TEXTURE2D(_MainTex); SAMPLER(sampler_MainTex);
            struct Attributes {float3 positionOS:POSITION;float2 uv:TEXCOORD0;half4 color:COLOR;};
            struct Varyings {float4 positionCS:SV_POSITION;float2 uv:TEXCOORD0;half4 color:COLOR;};
            Varyings Vert(Attributes v){Varyings o;o.positionCS=TransformObjectToHClip(v.positionOS);o.uv=v.uv;o.color=v.color;return o;}
            half4 Frag(Varyings i):SV_Target{return SAMPLE_TEXTURE2D(_MainTex,sampler_MainTex,i.uv)*i.color;}
            ENDHLSL
        }
    }
    Fallback "Sprites/Default"
}

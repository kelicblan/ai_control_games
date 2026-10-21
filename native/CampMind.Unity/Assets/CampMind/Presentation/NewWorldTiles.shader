Shader "CampMind/New World Tiles"
{
    Properties { _BaseColor("Tile colour",Color)=(.25,.32,.39,1) }
    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "RenderType"="Opaque" }
        Pass
        {
            Tags { "LightMode"="UniversalForward" }
            Cull Off
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile_fragment _ _SHADOWS_SOFT
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            CBUFFER_START(UnityPerMaterial)
            half4 _BaseColor;
            CBUFFER_END
            struct Input { float4 positionOS:POSITION; float3 normalOS:NORMAL; float2 uv:TEXCOORD0; };
            struct Vary { float4 positionCS:SV_POSITION; float3 positionWS:TEXCOORD0; half3 normalWS:TEXCOORD1; float2 uv:TEXCOORD2; };
            Vary Vert(Input i){ Vary o; o.positionWS=TransformObjectToWorld(i.positionOS.xyz);o.positionCS=TransformWorldToHClip(o.positionWS);o.normalWS=TransformObjectToWorldNormal(i.normalOS);o.uv=i.uv;return o; }
            half4 Frag(Vary i):SV_Target
            {
                float2 tile=frac(i.uv);float2 aa=max(fwidth(i.uv),.015);
                float groove=1-smoothstep(.02,.07+aa.x,min(tile.x,1-tile.x));
                float row=1-smoothstep(.025,.075+aa.y,min(tile.y,1-tile.y));
                float variation=frac(sin(dot(floor(i.uv),float2(127.1,311.7)))*43758.5453);
                half3 colour=_BaseColor.rgb*(.88+variation*.23)*(1-groove*.22-row*.17);
                colour+=half3(.055,.065,.075)*sin(tile.x*3.14159);
                half3 n=normalize(i.normalWS);if(n.y<0)n=-n;
                Light light=GetMainLight(TransformWorldToShadowCoord(i.positionWS));
                half3 illumination=SampleSH(n)+light.color*(saturate(dot(n,light.direction))*.75+.12)*light.shadowAttenuation;
                return half4(colour*illumination,1);
            }
            ENDHLSL
        }
        UsePass "Universal Render Pipeline/Lit/ShadowCaster"
    }
}

Shader "CampMind/Rain"
{
    Properties { _BaseColor("Color",Color)=(0.75,0.85,0.95,0.35) }
    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "Queue"="Transparent" "RenderType"="Transparent" }
        Pass
        {
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            Cull Off
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma target 3.5
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            CBUFFER_START(UnityPerMaterial)
            half4 _BaseColor;
            float4 _RoofBounds[16];
            float4 _RoofHeights[16];
            int _RoofCount;
            CBUFFER_END
            struct Attributes { float4 positionOS:POSITION; half4 color:COLOR; };
            struct Varyings { float4 positionCS:SV_POSITION; float3 positionWS:TEXCOORD0; half4 color:COLOR; };
            Varyings Vert(Attributes input)
            {
                Varyings output;output.positionWS=TransformObjectToWorld(input.positionOS.xyz);
                output.positionCS=TransformWorldToHClip(output.positionWS);output.color=input.color*_BaseColor;return output;
            }
            half4 Frag(Varyings input):SV_Target
            {
                for(int i=0;i<_RoofCount;i++){
                    float4 roof=_RoofBounds[i];
                    if(abs(input.positionWS.x-roof.x)<=roof.z && abs(input.positionWS.z-roof.y)<=roof.w && input.positionWS.y<_RoofHeights[i].x)discard;
                }
                return input.color;
            }
            ENDHLSL
        }
    }
}

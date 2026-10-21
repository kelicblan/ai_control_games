Shader "CampMind/New World Ground"
{
    Properties { _BaseColor("Ground colour",Color)=(.54,.58,.36,1) _Dirt("Dirt amount",Range(0,1))=0 _UseVertexDirt("Blend dirt into grass shoulders",Float)=0 _RockSlope("Expose stone on steep repaired shoulders",Range(0,1))=0 }
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
            half4 _BaseColor; half _Dirt;half _UseVertexDirt;half _RockSlope;
            CBUFFER_END
            struct Input { float4 positionOS:POSITION; float3 normalOS:NORMAL;half4 colour:COLOR; };
            struct Vary { float4 positionCS:SV_POSITION; float3 positionWS:TEXCOORD0; half3 normalWS:TEXCOORD1;half dirt:TEXCOORD2; };
            Vary Vert(Input i){Vary o;o.positionWS=TransformObjectToWorld(i.positionOS.xyz);o.positionCS=TransformWorldToHClip(o.positionWS);o.normalWS=TransformObjectToWorldNormal(i.normalOS);o.dirt=i.colour.r;return o;}
            float Hash(float2 p){return frac(sin(dot(p,float2(127.1,311.7)))*43758.5453);}
            float Noise(float2 p){float2 a=floor(p),f=frac(p);f=f*f*(3-2*f);return lerp(lerp(Hash(a),Hash(a+float2(1,0)),f.x),lerp(Hash(a+float2(0,1)),Hash(a+1),f.x),f.y);}
            half4 Frag(Vary i):SV_Target
            {
                float2 p=i.positionWS.xz;
                float patch=Noise(p*.28)*.65+Noise(p*.83)*.35;
                float grain=Noise(p*8);
                half3 grass=lerp(half3(.31,.38,.23),half3(.51,.56,.36),patch);
                half3 dirt=lerp(half3(.57,.49,.33),half3(.80,.73,.54),patch);
                half3 colour=lerp(grass,dirt,saturate(_Dirt*lerp(1,i.dirt,_UseVertexDirt)))*(grain*.14+.93);
                half3 normal=normalize(i.normalWS);if(normal.y<0)normal=-normal;
                float stoneNoise=Noise(p*1.7+i.positionWS.y*.43);
                half3 stone=lerp(half3(.32,.34,.31),half3(.60,.61,.54),stoneNoise)*(grain*.2+.9);
                colour=lerp(colour,stone,_RockSlope*(1-smoothstep(.45,.82,normal.y)));
                Light light=GetMainLight(TransformWorldToShadowCoord(i.positionWS));
                half3 illumination=SampleSH(normal)+light.color*(saturate(dot(normal,light.direction))*.75+.12)*light.shadowAttenuation;
                return half4(colour*illumination,1);
            }
            ENDHLSL
        }
        UsePass "Universal Render Pipeline/Lit/ShadowCaster"
    }
}

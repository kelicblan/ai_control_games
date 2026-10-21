Shader "CampMind/New World Registered Terrain"
{
    Properties { _BaseMap("Authored source albedo",2D)="white"{} _ControlMap("Observed vector road controls",2D)="black"{} _WorldRect("Control world bounds",Vector)=(0,0,1,1) }
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
            float4 _WorldRect;
            CBUFFER_END
            float _NewWorldDaylight;
            TEXTURE2D(_BaseMap);SAMPLER(sampler_BaseMap);TEXTURE2D(_ControlMap);SAMPLER(sampler_ControlMap);
            struct Input{float4 positionOS:POSITION;float3 normalOS:NORMAL;float2 uv:TEXCOORD0;};
            struct Vary{float4 positionCS:SV_POSITION;float3 normal:TEXCOORD0;float2 uv:TEXCOORD1;float3 world:TEXCOORD2;};
            Vary Vert(Input i){Vary o;o.world=TransformObjectToWorld(i.positionOS.xyz);o.positionCS=TransformWorldToHClip(o.world);o.normal=TransformObjectToWorldNormal(i.normalOS);o.uv=i.uv;return o;}
            float Hash(float2 p){return frac(sin(dot(p,float2(127.1,311.7)))*43758.5453);}
            float Noise(float2 p){float2 a=floor(p),f=frac(p);f=f*f*(3-2*f);return lerp(lerp(Hash(a),Hash(a+float2(1,0)),f.x),lerp(Hash(a+float2(0,1)),Hash(a+1),f.x),f.y);}
            half4 Frag(Vary i):SV_Target
            {
                half3 authored=SAMPLE_TEXTURE2D(_BaseMap,sampler_BaseMap,i.uv).rgb;half3 normal=normalize(i.normal);
                float2 control=SAMPLE_TEXTURE2D(_ControlMap,sampler_ControlMap,(i.world.xz-_WorldRect.xy)/_WorldRect.zw).rg;float road=control.r;
                float patch=Noise(i.world.xz*.25)*.6+Noise(i.world.xz*.8)*.4;
                half3 grass=lerp(half3(.27,.33,.13),half3(.47,.52,.27),patch);half3 soil=lerp(half3(.48,.40,.25),half3(.70,.60,.40),patch);
                float ground=smoothstep(.45,.85,abs(normal.y))*saturate((authored.r+authored.g-2*authored.b-.03)*6)*(1-smoothstep(5,8,i.world.y));
                half3 paint=lerp(grass,soil,road)*(.75+dot(authored,half3(.3,.5,.2))*.65);
                half3 colour=lerp(authored,paint,ground*.80);
                float2 tiles=i.world.xz*float2(.65,.9);tiles.x+=floor(tiles.y)*.5;float2 cell=frac(tiles);float edge=min(min(cell.x,1-cell.x),min(cell.y,1-cell.y));float mortar=1-smoothstep(.012,.045,edge);
                half3 paving=half3(.59,.57,.49)*(.90+Hash(floor(tiles))*.10-mortar*.19);
                colour=lerp(colour,paving,control.g*smoothstep(.65,.88,normal.y)*smoothstep(7.5,9.5,i.world.y));
                Light light=GetMainLight(TransformWorldToShadowCoord(i.world));float diffuse=saturate(dot(normal,light.direction));
                return half4(colour*(.72+.28*diffuse)*(.72+.28*light.shadowAttenuation)*max(.025,_NewWorldDaylight),1);
            }
            ENDHLSL
        }
        UsePass "Universal Render Pipeline/Lit/ShadowCaster"
    }
}

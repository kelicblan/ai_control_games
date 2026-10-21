using System;
using UnityEngine;

namespace CampMind.Editor
{
    // Thin-plate interpolation of observed ground controls. No random displacement.
    public sealed class NewWorldTerrainRegistration
    {
        private readonly Vector2[] controls;
        private readonly double[,] weights;
        private static double Kernel(Vector2 delta){double r=delta.sqrMagnitude;return r<1e-16?0:r*Math.Log(r);}
        public NewWorldTerrainRegistration(Vector2[] source,Vector3[] target)
        {
            if(source.Length<3||source.Length!=target.Length)throw new ArgumentException("Terrain requires paired controls");
            controls=(Vector2[])source.Clone();int n=source.Length,size=n+3;var matrix=new double[size,size+3];
            for(int i=0;i<n;i++){
                for(int j=0;j<n;j++){if(i!=j&&(source[i]-source[j]).sqrMagnitude<1e-12f)throw new ArgumentException("Duplicate terrain control");matrix[i,j]=Kernel(source[i]-source[j]);}
                matrix[i,n]=matrix[n,i]=1;matrix[i,n+1]=matrix[n+1,i]=source[i].x;matrix[i,n+2]=matrix[n+2,i]=source[i].y;
                matrix[i,size]=target[i].x;matrix[i,size+1]=target[i].y;matrix[i,size+2]=target[i].z;
            }
            for(int col=0;col<size;col++){
                int pivot=col;for(int row=col+1;row<size;row++)if(Math.Abs(matrix[row,col])>Math.Abs(matrix[pivot,col]))pivot=row;
                if(Math.Abs(matrix[pivot,col])<1e-12)throw new ArgumentException("Degenerate terrain controls");
                if(pivot!=col)for(int j=col;j<size+3;j++){double temp=matrix[col,j];matrix[col,j]=matrix[pivot,j];matrix[pivot,j]=temp;}
                double divisor=matrix[col,col];for(int j=col;j<size+3;j++)matrix[col,j]/=divisor;
                for(int row=0;row<size;row++){if(row==col)continue;double factor=matrix[row,col];for(int j=col;j<size+3;j++)matrix[row,j]-=factor*matrix[col,j];}
            }
            weights=new double[size,3];for(int i=0;i<size;i++)for(int axis=0;axis<3;axis++)weights[i,axis]=matrix[i,size+axis];
        }
        public Vector3 Map(Vector2 point)
        {
            int n=controls.Length;var value=Vector3.zero;
            for(int axis=0;axis<3;axis++){double sum=weights[n,axis]+weights[n+1,axis]*point.x+weights[n+2,axis]*point.y;for(int i=0;i<n;i++)sum+=weights[i,axis]*Kernel(point-controls[i]);value[axis]=(float)sum;}
            return value;
        }
        public float JacobianXZ(Vector2 point)
        {
            int n=controls.Length;double xx=weights[n+1,0],xz=weights[n+1,2],yx=weights[n+2,0],yz=weights[n+2,2];
            for(int i=0;i<n;i++){var delta=point-controls[i];double r=delta.sqrMagnitude;if(r<1e-16)continue;double factor=2*(Math.Log(r)+1),dx=delta.x*factor,dy=delta.y*factor;xx+=weights[i,0]*dx;xz+=weights[i,2]*dx;yx+=weights[i,0]*dy;yz+=weights[i,2]*dy;}
            return (float)(xx*yz-yx*xz);
        }
    }
}

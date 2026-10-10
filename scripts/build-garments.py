"""Build smooth, indexed garment shells from the supplied transparent artwork.

The images are sampled without modification. Geometry uses a smoothed contour,
rounded cloth volume and continuous vertex normals, instead of pixel extrusion.
Requires numpy, scipy, matplotlib and Pillow. Run from the repository root.
"""
from pathlib import Path
import json, struct
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, distance_transform_edt, map_coordinates
from scipy.spatial import Delaunay
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
SLUGS = ['classical-red-statue', 'chrome-bear', 'elevate-higher', 'golden-mountains']

def build(slug):
    image = Image.open(ROOT / 'assets' / (slug+'-floating.webp')).convert('RGBA')
    back = Image.open(ROOT / 'assets' / (slug+'-rear.webp')).convert('RGBA')
    size=360
    a=np.array(image.resize((size,size)))[:,:,3]/255.
    b=np.array(back.resize((size,size)))[:,:,3]/255.
    mask=gaussian_filter(a, .7)
    outline=max(plt.contour(mask, levels=[.55]).allsegs[0], key=len)
    plt.close()
    # Resample a continuous outline at even intervals; no stair-step side walls.
    dist=np.r_[0,np.cumsum(np.linalg.norm(np.diff(outline,axis=0),axis=1))]
    samples=np.linspace(0,dist[-1],420,endpoint=False)
    contour=np.column_stack([np.interp(samples,dist,outline[:,i]) for i in range(2)])
    for _ in range(2): contour=.7*contour+.15*np.roll(contour,1,axis=0)+.15*np.roll(contour,-1,axis=0)
    signed=distance_transform_edt(mask>.55)-distance_transform_edt(mask<=.55)
    signed=gaussian_filter(signed, .85)
    # Interior points are denser near bends and contour boundaries.
    points=[]
    for y in np.arange(0,size,6):
        for x in np.arange(0,size,6):
            xx=x+(3 if int(y/6)%2 else 0)
            if xx<size and map_coordinates(signed,[[y],[xx]],order=1)[0]>2.5: points.append([xx,y])
    points=np.vstack([contour,np.array(points)])
    tri=Delaunay(points).simplices
    mids=points[tri].mean(axis=1)
    keep=map_coordinates(mask,[mids[:,1],mids[:,0]],order=1)>.46
    tri=tri[keep]
    yy,xx=np.where(mask>.55)
    lo=np.array([xx.min(),yy.min()]);hi=np.array([xx.max(),yy.max()]);center=(lo+hi)/2
    span=max(hi-lo);scale=2.65/span
    distance=np.maximum(0,map_coordinates(signed,[points[:,1],points[:,0]],order=1))
    t=(points[:,1]-lo[1])/(hi[1]-lo[1])
    # Rounded shoulders, a fuller torso and a soft drape toward the hem.
    depth=.265*np.sqrt(1-np.exp(-distance/12))*(.95+.12*np.sin(t*np.pi))
    x=(points[:,0]-center[0])*scale
    y=(center[1]-points[:,1])*scale
    folds=(.003*np.sin(x*29+t*6)+.002*np.sin(x*47-t*12))*(.35+.65*t)
    depth+=folds*np.minimum(distance/10,1)
    depth[:len(contour)]=0
    nx=(points[:,0]-center[0])/(hi[0]-lo[0])
    # Leave the garment open at the hem, collar and sleeve cuffs. The panels
    # curve around the torso instead of collapsing into a sealed padded slab.
    hem=np.clip((t-.87)/.1,0,1)
    hem_profile=.235*np.sqrt(np.maximum(0,1-(nx/.305)**2))
    depth=depth*(1-hem)+hem_profile*hem
    neck=np.clip((.085-t)/.06,0,1)*np.clip((.21-np.abs(nx))/.045,0,1)
    neck_profile=.125*np.sqrt(np.maximum(0,1-(nx/.21)**2))
    depth=depth*(1-neck)+neck_profile*neck
    # A narrow sleeve opening reads as hollow cloth at three-quarter angles.
    cuff=np.clip((np.abs(nx)-.27)/.09,0,1)*np.clip((t-.29)/.08,0,1)*np.clip((.49-t)/.035,0,1)
    cuff_profile=.08*np.sqrt(np.maximum(0,1-((np.abs(nx)-.39)/.125)**2))
    depth=depth*(1-cuff)+cuff_profile*cuff
    front=np.column_stack([x,y,depth])
    rear=np.column_stack([x,y,-depth*.94])
    # Map each rear scanline to the corresponding garment span. Artwork retains
    # its orientation while front/rear silhouettes share the same sewn boundary.
    def bounds(alpha):
        coords=np.argwhere(alpha>.55);top,bottom=coords[:,0].min(),coords[:,0].max()
        rows=[]
        for row in alpha:
            xs=np.where(row>.55)[0]
            rows.append([xs.min(),xs.max()] if len(xs) else [size/2,size/2])
        return np.array(rows),top,bottom
    fb,ft,fh=bounds(mask);bb,bt,bh=bounds(b)
    fy=np.clip(points[:,1],0,size-1)
    by=bt+np.clip((fy-ft)/(fh-ft),0,1)*(bh-bt)
    # Back faces reverse the horizontal coordinate when viewed from behind.
    fl=np.interp(fy,np.arange(size),fb[:,0]);fr=np.interp(fy,np.arange(size),fb[:,1])
    bl=np.interp(by,np.arange(size),bb[:,0]);br=np.interp(by,np.arange(size),bb[:,1])
    fraction=np.clip((points[:,0]-fl)/np.maximum(fr-fl,1),.006,.994)
    bu=br-fraction*(br-bl)
    uv=points/(size-1)
    backuv=np.column_stack([bu,by])/(size-1)
    n=len(points)
    faces=[]
    for q in tri:
        p=front[q]
        if np.cross(p[1]-p[0],p[2]-p[0])[2]<0:q=q[::-1]
        faces.append(q);faces.append((q+n)[::-1])
    faces=np.array(faces,dtype=np.uint32)
    verts=np.vstack([front,rear])
    normals=np.zeros_like(verts)
    fn=np.cross(verts[faces[:,1]]-verts[faces[:,0]],verts[faces[:,2]]-verts[faces[:,0]])
    for k in range(3):np.add.at(normals,faces[:,k],fn)
    # The shared perimeter smoothly joins both panels, with no hard black slab.
    for i in range(len(contour)):
        if depth[i]>.012:continue
        normal=normals[i]+normals[i+n]
        normals[i]=normal;normals[i+n]=normal
    normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-8)
    data=np.column_stack([verts,normals,np.vstack([uv,backuv]),np.r_[np.zeros(n),np.ones(n)]]).astype('<f4')
    output=ROOT/'assets'/(slug+'.mesh')
    with output.open('wb') as f:
        f.write(struct.pack('<III',0x465A4D32,len(data),faces.size))
        f.write(data.tobytes());f.write(faces.astype('<u2').tobytes())
    return {'slug':slug,'vertices':len(data),'triangles':len(faces),'bytes':output.stat().st_size}

if __name__=='__main__':
    print(json.dumps([build(slug) for slug in SLUGS],indent=2))

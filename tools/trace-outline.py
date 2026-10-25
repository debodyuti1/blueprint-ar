from PIL import Image
import numpy as np, json
im=np.asarray(Image.open('poster_src.png').convert('RGB')).astype(float)
H,W,_=im.shape
L={}; R={}
for y in range(18,736):
    ref=im[y,30:80].mean(axis=0); d=np.sqrt(((im[y]-ref)**2).sum(axis=1)); sky=d<40
    l=503
    while l>4 and not sky[l-3:l].all(): l-=1
    r=503
    while r<W-4 and not sky[r+1:r+4].all(): r+=1
    L[y]=l; R[y]=r
ys=sorted(L)
def med(D):
    out={}
    for y in ys:
        win=[D[k] for k in range(y-3,y+4) if k in D]; out[y]=float(np.median(win))
    return out
L=med(L); R=med(R)
def rdp(pts,eps):
    if len(pts)<3: return pts
    a=np.array(pts[0]); b=np.array(pts[-1]); ab=b-a; n=np.linalg.norm(ab)
    ds=[abs(ab[0]*(p[1]-a[1])-ab[1]*(p[0]-a[0]))/n if n else np.linalg.norm(np.array(p)-a) for p in pts]
    i=int(np.argmax(ds))
    if ds[i]>eps: return rdp(pts[:i+1],eps)[:-1]+rdp(pts[i:],eps)
    return [pts[0],pts[-1]]
left=[(L[y],y) for y in ys]+[(385,736),(385,1318),(358,1318),(358,1404),(351,1404),(351,1600)]
right=[(R[y],y) for y in ys]+[(616,736),(616,1318),(638,1318),(638,1404),(635,1404),(635,1600)]
left=rdp(left,1.2); right=rdp(right,1.2)
tip=(503.5,18)
outline=[(x,y) for x,y in reversed(left)]+[tip]+[(x,y) for x,y in right]
paths={'outline':outline}
lines=[]
def hl(y,x0,x1,w=1.6,o=0.9): lines.append(dict(d=[[x0,y],[x1,y]],w=w,o=o))
def vl(x,y0,y1,w=1.2,o=0.7): lines.append(dict(d=[[x,y0],[x,y1]],w=w,o=o))
for y,x0,x1 in [(1318,358,638),(1404,351,635),(736,385,616),(600,393,609),(505,418,586),(470,438,566)]: hl(y,x0,x1)
for x in [440,462,544,562]: vl(x,600,1600)
for x in [410,592]: vl(x,736,1600,1,0.45)
# floor lines, thin
for y in range(620,1600,22):
    x0,x1=(393,609) if y<736 else (385,616) if y<1318 else (358,638) if y<1404 else (351,635)
    lines.append(dict(d=[[x0,y],[x1,y]],w=0.6,o=0.22))
json.dump(dict(w=W,h=H,outline=[[round(x,1),y] for x,y in outline],lines=lines),open('/home/claude/blueprint-ar/assets/outline.json','w'))
print(len(outline),'outline pts',len(lines),'lines')

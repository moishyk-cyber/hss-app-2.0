import {currentUser} from '@/lib/permissionsServer';
import {myItemPage} from '@/lib/myItemsData';
import type {MyItemKind} from '@/lib/myItemsTypes';
export async function GET(request:Request){
 const user=await currentUser();
 const headers={'Cache-Control':'private, no-store'};
 if(!user)return Response.json({message:'Sign in to view your items.'},{status:401,headers});
 const params=new URL(request.url).searchParams;
 const kind=params.get('kind');
 if(!kind||!['deals','orders','tasks','pricing'].includes(kind))return Response.json({message:'Choose a valid queue.'},{status:400,headers});
 const cursor=params.get('cursor')??undefined;
 if(cursor && cursor.length>200)return Response.json({message:'Invalid cursor.'},{status:400,headers});
 try{return Response.json(await myItemPage(kind as MyItemKind,user.id,cursor),{headers});}
 catch{return Response.json({message:'Could not load your items. Please try again.'},{status:503,headers});}
}

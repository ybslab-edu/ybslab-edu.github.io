// DF envelope v1 and three UID slots stay unchanged. Local clocks only detect overwrite conflicts.
export function createDFReports({course,getSession,mark,active,claims,context,fail,now=Date.now}){
  async function identity(m){
    if(course!=='115-df')throw fail('report/course');
    const c=await claims(m),provider=c.firebase?.sign_in_provider;
    if(!['google.com','password'].includes(provider)||typeof c.email!=='string'||provider==='google.com'&&c.email_verified!==true)throw fail('report/auth');
    const email=c.email.toLowerCase().replace('@ybslab-edu.github.io','@cgjh.hcc.edu.tw');
    if(!/^[a-z0-9._%+-]+@cgjh\.hcc\.edu\.tw$/.test(email))throw fail('report/auth');
    const {db}=await getSession(),ref=await db.doc('ybsCourses/115-df/roster/'+email).get({source:'server'});active(m);
    const row=ref.exists&&!ref.metadata?.fromCache&&ref.data(),control=await context(1,0);active(m);
    if(!row||row.active!==true||row.subject!==control.subject||!Number.isInteger(row.cls)||row.cls<100||row.cls>999
      ||!Number.isInteger(row.seat)||row.seat<1||row.seat>60)throw fail('report/not-listed');
    return {db,cls:row.cls,seat:row.seat};
  }
  return {
    async whoami(){try{const m=mark(),r=await identity(m);return {ok:true,student:{cls:r.cls,seat:r.seat}};}catch{return {ok:false,error:'report/auth'};}},
    async submitReport(session,encoded){
      const m=mark();
      if(!Number.isInteger(session)||session<1||session>3)throw fail('report/session');
      if(encoded?.schemaVersion!==1||!['ascii-json','gzip-base64'].includes(encoded.encoding)||typeof encoded.payload!=='string'
        ||!encoded.payload.length||encoded.payload.length>524288||/[^\x20-\x7e]/.test(encoded.payload)
        ||!Number.isFinite(encoded.snapshotAt)||encoded.snapshotAt<=0)throw fail('report/format');
      const {db,cls,seat}=await identity(m);active(m);
      if(Number(encoded.cls)!==cls||Number(encoded.seat)!==seat)throw fail('report/identity');
      const ref=db.doc(`ybsCourses/115-df/reports/${m.uid}_s${session}`),packet={schemaVersion:1,encoding:encoded.encoding,payload:encoded.payload};
      await db.runTransaction(async tx=>{
        active(m);const previous=await tx.get(ref);active(m);const old=previous.exists?previous.data():null;
        if(old&&old.uid===m.uid&&old.session===session&&old.cls===cls&&old.seat===seat&&old.schemaVersion===1&&old.encoding===packet.encoding&&old.payload===packet.payload)return;
        const updatedAt=old?.updatedAt?.toMillis();
        if(old&&updatedAt>encoded.snapshotAt&&old.payload!==packet.payload&&encoded.overwriteAt!==updatedAt)throw Object.assign(fail('report/conflict'),{updatedAt});
        if(old&&Number.isFinite(updatedAt)&&now()<updatedAt+60000)throw Object.assign(fail('report/rate-limited'),{retryAt:updatedAt+60000});
        const stamp=firebase.firestore.FieldValue.serverTimestamp();
        tx.set(ref,{uid:m.uid,session,cls,seat,...packet,createdAt:old?old.createdAt:stamp,updatedAt:stamp});
      });active(m);
      const received=await ref.get({source:'server'});active(m);const report=received.exists&&!received.metadata?.fromCache&&received.data(),updatedAt=report?.updatedAt?.toMillis();
      if(!Number.isFinite(updatedAt))throw fail('unavailable');
      if(report.payload!==packet.payload||report.encoding!==packet.encoding)throw Object.assign(fail('report/conflict'),{updatedAt});
      return {courseId:'115-df',uid:m.uid,session,cls,seat,updatedAt};
    }
  };
}

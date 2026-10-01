import { useState } from 'react'
import { Mail, MessageCircle } from 'lucide-react'
import EmailWorkspace from './EmailWorkspace'
import WhatsAppWorkspace from './WhatsAppWorkspace'

type Application={id:string;name:string}
type Role='owner'|'admin'|'reviewer'

export default function CommunicationsWorkspace({organizationId,applications,role}:{organizationId:string;applications:Application[];role?:Role}){
  const [channel,setChannel]=useState<'email'|'whatsapp'>('email')
  return <section>
    <div className="page-heading compact"><div><p className="eyebrow">Workspace</p><h1>Communication Center</h1><p className="subtitle">Reach programme participants through managed email and WhatsApp channels.</p></div></div>
    <div className="email-tabs">
      <button className={channel==='email'?'secondary-button':'text-button'} onClick={()=>setChannel('email')}><Mail size={16}/> Email</button>
      <button className={channel==='whatsapp'?'secondary-button':'text-button'} onClick={()=>setChannel('whatsapp')}><MessageCircle size={16}/> WhatsApp</button>
    </div>
    {channel==='email'?<EmailWorkspace organizationId={organizationId} applications={applications} role={role}/>:<WhatsAppWorkspace organizationId={organizationId} applications={applications} role={role}/>}
  </section>
}

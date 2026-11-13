export function createDialogService(){
  let dialog=document.getElementById('input-dialog');
  if(!dialog){
    dialog=document.createElement('dialog');
    dialog.id='input-dialog';
    dialog.innerHTML='<form method="dialog"><span class="eyebrow">FORMA DESKTOP</span><h2 id="input-dialog-title">Rename</h2><p id="input-dialog-message"></p><input id="input-dialog-value" aria-label="Name"><div class="input-dialog-actions"><button value="cancel" class="secondary-btn">Cancel</button><button value="confirm" class="primary-btn">Save</button></div></form>';
    document.body.append(dialog);
    const style=document.createElement('style');
    style.textContent='#input-dialog{width:min(420px,90vw);padding:0;border:0;border-radius:12px;overflow:hidden}#input-dialog form{padding:26px;display:flex;flex-direction:column;gap:12px}#input-dialog h2{margin:0;color:#26372d;font-size:20px}#input-dialog p{margin:0;color:#748078;font-size:12px;line-height:1.45}#input-dialog input{height:42px;border:1px solid #dce4de;border-radius:7px;padding:0 12px;font:inherit;color:#26372d;background:#fff}#input-dialog input:focus{outline:2px solid #8fc8ae;outline-offset:1px}.input-dialog-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:8px}.input-dialog-actions button{width:auto;padding:9px 16px}';
    document.head.append(style);
  }
  const input=dialog.querySelector('#input-dialog-value');
  const message=dialog.querySelector('#input-dialog-message');
  const confirmButton=dialog.querySelector('[value="confirm"]');
  function complete(setup){
    setup();
    dialog.showModal();
    return new Promise(resolve=>{
      const finish=()=>{dialog.removeEventListener('close',finish);input.hidden=false;resolve(dialog.returnValue);};
      dialog.addEventListener('close',finish);
    });
  }
  async function ask({title='Rename',message:text='',value='',confirmLabel='Save'}={}){
    const result=await complete(()=>{dialog.querySelector('h2').textContent=title;message.textContent=text;message.hidden=!text;input.hidden=false;input.value=value;confirmButton.textContent=confirmLabel;requestAnimationFrame(()=>{input.focus();input.select();});});
    const valueResult=input.value.trim();
    return result==='confirm'&&valueResult?valueResult:null;
  }
  async function confirm({title='Confirm',message:text='',confirmLabel='Confirm'}={}){
    const result=await complete(()=>{dialog.querySelector('h2').textContent=title;message.textContent=text;message.hidden=false;input.hidden=true;confirmButton.textContent=confirmLabel;});
    return result==='confirm';
  }
  return {ask,confirm};
}

const test=require('node:test');const assert=require('node:assert/strict');
test('preview runtime is a complete executable script',async()=>{const {buildPreviewRuntime}=await import('../dist/preview-runtime.js'),html=buildPreviewRuntime(),source=html.slice('<script>'.length,-'</script>'.length);assert.doesNotThrow(()=>new Function(source));assert.match(source,/data-forma-prototype/);assert.match(source,/navigate-page/);assert.match(source,/data-forma-page/);assert.match(source,/data-forma-visible-if/);assert.match(source,/evaluateCondition/);});

test('prototype click, mouse-enter and double-click triggers execute their saved actions',async()=>{
  const {buildPreviewRuntime}=await import('../dist/preview-runtime.js');
  const source=buildPreviewRuntime().slice('<script>'.length,-'</script>'.length),elements=[
    {dataset:{formaPrototype:JSON.stringify({trigger:'click',action:'set-variable',variable:'saved',value:'toggle'})}},
    {dataset:{formaPrototype:JSON.stringify({trigger:'mouseenter',action:'message',target:'Hover works'})}},
    {dataset:{formaPrototype:JSON.stringify({trigger:'dblclick',action:'open-url',target:'https://example.com'})}},
    {dataset:{formaPrototype:JSON.stringify({trigger:'click',action:'submit-email',target:'newsletter-email'})}},
    {dataset:{formaPrototype:JSON.stringify({trigger:'click',enabled:false,action:'message',target:'must stay disabled'})}},
  ];
  const listeners={},opened=[],variables={textContent:'{"saved":false}'},toast={dataset:{},style:{},hidden:true,setAttribute(){}},input={value:'',type:'email',checkValidity:()=>true,focus(){}};
  for(const element of elements){element.style={};element.attributes={};element.classList={toggle(){}};element.addEventListener=(name,handler)=>{listeners[name]=listeners[name]||[];listeners[name].push(handler);};element.setAttribute=(name,value)=>{element.attributes[name]=value;};}
  const document={body:{dataset:{},append(){}},documentElement:{style:{setProperty(){}}},querySelector(selector){if(selector==='#forma-variable-data')return variables;if(selector==='[data-forma-preview-toast]')return toast;return null;},querySelectorAll(selector){if(selector==='[data-forma-prototype]')return elements;return [];},addEventListener(){},createElement(){return toast;},getElementById(id){return id==='newsletter-email'?input:null;}};
  const window={dispatchEvent(){},open(...args){opened.push(args);}},location={href:'https://forma.local/'};
  new Function('document','window','location','CustomEvent','setTimeout','clearTimeout',source)(document,window,location,class CustomEvent{constructor(type,options){this.type=type;this.detail=options?.detail;}},()=>1,()=>{});
  assert.equal(listeners.click.length,2,'disabled imported prototype records do not attach click handlers');
  assert.equal(elements[4].style.cursor,undefined,'disabled imported prototype records do not look interactive');
  listeners.click[0]({target:{closest(){return elements[0];}},currentTarget:elements[0],preventDefault(){}});
  listeners.mouseenter[0]({target:{closest(){return elements[1];}},currentTarget:elements[1]});
  listeners.dblclick[0]({target:{closest(){return elements[2];}},currentTarget:elements[2]});
  listeners.click[1]({target:{closest(){return elements[3];}},currentTarget:elements[3],preventDefault(){}});
  assert.equal(toast.textContent,'Enter an email address to try the newsletter sign-up.');
  input.value='adriano@example.com';listeners.click[1]({target:{closest(){return elements[3];}},currentTarget:elements[3],preventDefault(){}});
  assert.equal(elements[0].attributes['aria-pressed'],'true');
  assert.equal(toast.textContent,'Newsletter sign-up demo complete. No email was sent.');
  assert.equal(opened[0][0],'https://example.com');
});

test('preview runs multiple interactions on one layer and preserves ordered action chains',async()=>{
  const {buildPreviewRuntime}=await import('../dist/preview-runtime.js'),source=buildPreviewRuntime().slice('<script>'.length,-'</script>'.length);
  const element={dataset:{formaPrototype:JSON.stringify([
    {trigger:'click',actions:[{action:'message',target:'First'},{action:'message',target:'Second'}]},
    {trigger:'dblclick',actions:[{action:'message',target:'Double'}]},
  ])},style:{},listeners:{},classList:{toggle(){}},addEventListener(name,handler){this.listeners[name]=handler;},setAttribute(){}};
  const toast={dataset:{},style:{},hidden:true,setAttribute(){}};
  const document={body:{dataset:{},append(){}},documentElement:{style:{setProperty(){}}},querySelector(selector){if(selector==='[data-forma-preview-toast]')return toast;return null;},querySelectorAll(selector){return selector==='[data-forma-prototype]'?[element]:[];},addEventListener(){},createElement(){return toast;},getElementById(){return null;}};
  const window={dispatchEvent(){}},location={href:'https://forma.local/'};
  new Function('document','window','location','CustomEvent','setTimeout','clearTimeout',source)(document,window,location,class CustomEvent{constructor(type,options){this.type=type;this.detail=options?.detail;}},()=>1,()=>{});
  element.listeners.click({target:{},currentTarget:element});assert.equal(toast.textContent,'Second');
  element.listeners.dblclick({target:{},currentTarget:element});assert.equal(toast.textContent,'Double');
});

const archiveToggle=document.querySelector('.x-archive-toggle');
const archivePanel=document.getElementById('x-archive-panel');
if(archiveToggle&&archivePanel){archiveToggle.addEventListener('click',()=>{const isOpen=archiveToggle.getAttribute('aria-expanded')==='true';archiveToggle.setAttribute('aria-expanded',String(!isOpen));archivePanel.hidden=isOpen;});}


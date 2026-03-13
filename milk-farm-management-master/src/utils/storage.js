const KEY = 'milk_farm_data_v1'

export function load(){
  try{
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : {farmers:[], expenses:[], revenue:[]}
  }catch(e){
    return {farmers:[], expenses:[], revenue:[]}
  }
}

export function save(data){
  try{
    localStorage.setItem(KEY, JSON.stringify(data))
  }catch(e){
    // ignore localStorage errors
  }

  // fire-and-forget: attempt to save remotely if firebase is configured
  try{
    // dynamic import so the app still works if Firebase isn't configured / installed
    import('../firebase').then(mod => {
      if (mod && typeof mod.saveRemote === 'function') mod.saveRemote(data).catch(()=>{})
    }).catch(()=>{})
  }catch(e){/* ignore */}
}

export { KEY }

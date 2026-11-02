// Test-process guard: even misconfigured SDKs cannot contact a real backend.
import net from "node:net";
import tls from "node:tls";
function local(args) {
  let first=args[0];if(Array.isArray(first))first=first[0];
  const options=typeof first==="object"&&first!==null?first:{port:first,host:typeof args[1]==="string"?args[1]:"localhost"};
  const host=options.host||options.hostname||"localhost";
  if(options.path||!["127.0.0.1","localhost","::1"].includes(host)||![8087,9097].includes(Number(options.port)))throw Error("local_emulator_network_only");
}
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){local(args);return connect.apply(this,args);};
const secure=tls.connect;
tls.connect=function(...args){local(args);return secure.apply(this,args);};

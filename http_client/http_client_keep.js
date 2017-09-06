/**
 *http 客户端处理工具
 * User: liyangli
 * Date: 2017/3/10
 * Time: 14:30
 */
var http = require('http');
var setting = require('../config/setting');
var qs = require('querystring');
let net = require("net");
const moment  = require('moment');

/**
 * http客户端发送设备相关数据
 */
class HttpClient{
    
    constructor(webIP,webPort,timeout,ev){
        const self = this;
        let platform = process.platform;
        let newLine = "\n";
        if(platform == 'win32'){
            newLine = "\r\n";
        }
        this.timeout = timeout;
        this.newLine = newLine;
        this.client = net.createConnection({
            host: webIP,
            port: webPort
        }, ()=>{
            //连接成功
            ev.on("reviceEventName",function(err,obj){
                //需要获取对应obj中的msgID;然后进行返回对应数据；
                //进行发送ok。完成；
                const msgID = obj.msgID;
                //组装需要回应的数据
                //根据对应协议类型进行返回不同数据类型；针对获取状态需要进行变化设定
                // 需要进行延迟方式进行返回
                const type = obj.infoType;
                if(type == "ip.playstatus"){
                    //开启具体任务进行发送数据
                    self._sendPlayStatus(obj);
                }else{
                    self.send({protocolType: obj.protocolType,errCode: 0,desc:'success'});
                }

            });


        });
        new ReceiveDeal(this.client,ev);
        this.ev = ev;
    }

    /**
     * 响应播放状态
     * @private
     */
    _sendPlayStatus(obj){
        //开启定时任务进行执行获取对应数据；任务完成后进行注销定时任务；
        let program = 0;
        let self = this;
        let handler = setInterval(function(){
            //每次发送增量数据；
            program += 10;
            if(program > 100){
                clearInterval(handler);
                return;
            }
            self.send({protocolType: obj.protocolType,errCode: 0,desc:'success',taskID: obj.taskID,playTime:program,playProgress:program});
        },3*1000);
        self.send({protocolType: obj.protocolType,errCode: 0,desc:'success',taskID: obj.taskID,playTime:program,playProgress:program});
    }

     /**
     * 发送具体的数据
     * @param conn
     * @param sendContent
     * @private
     * @return string 事件监听的属性;主要组成方式sendObj.protocolType+"_"+sendObj.msgID
     */
    _send(conn,sendContent){
        sendContent = JSON.stringify(sendContent);
        //获取对一个字符长度
        let contentLen = new Buffer(sendContent).length;
        let msg = this._setHeader(contentLen)+this.newLine+sendContent;
        conn.write(msg);
    }

    /**
     * 进行尝试连接。最多10从尝试。每次为3秒
     */
    _replaceConn(num){
        console.info("现在是第："+num+" 尝试连接；");
        let self = this;
        if(num > 10){
            //最多10次尝试机会
            return;
        }
        setTimeout(function(){
            //通道被关闭了。需要重新连接上；
            try{
                self.client = net.createConnection({
                    host: webIP,
                    port: webPort
                }, ()=>{
                    //连接成功
                    console.info("重连成功");
                });
            }catch(e){
                self._replaceConn(num + 1);
            }
            },3*1000);
    }

    _setHeader(len){
        var msg = `HTTP/1.1 200 OK
Connection: keep-alive
Content-Length: ${len}
Content-Type: application/json;charset=UTF-8${this.newLine}`;
        return msg;
    }
    send(content){
        //作为一个http客户端进行设定;
        this._send(this.client,content);
        
        this.ev.on("sendFinish",(result)=>{
            console.info("sendFinish->"+result);
        })
        
    }
}
/**
 * 发送具体的数据。防止闭包情况下出现问题;
 */
class ReceiveDeal{
    constructor(httpConn,ev){
        this.httpConn = httpConn;
        this.ev = ev;
        this._receive();
    }

    _receive(){
        const self = this;

        //根据超时时间进行判断。如果下超时时间内没有响应数据就直接返回没有数据。否则直接返回对应数据;
        let msg = "";
        //设定一个对象。设定一个上下文数据;
        let start ;
        //需要查看当前是什么系统、如果是win 则\r\n;其他系统直接\n
        let platform = process.platform;
        let newLine = "\n";
        if(platform == 'win32'){
            newLine = "\r\n";
        }
        this.httpConn.on('data',(data)=>{
            //包含的场景:1、完整数据;2、不全数据;3、多个完整数据;4、多个数据但最后一个不完整
            if(!start){
                start = new Date().getTime();
            }
            
            //开启具体定时处理任务,如果尝试长时间没有设定表明就被重置了;
            msg += data.toString();
            //1、进行数据通过http头方式进行分割
            let prefixMsg = "HTTP/1.1 200 OK";
            const httpMsgs = msg.split(prefixMsg);
            //需要把msg 制空;主要针对后续数据在设定时再针对msg进行赋值;
            
            console.info(`*****************协议接收数据 start(${moment().format("YYYY-MM-DD HH:mm:ss")})******************************`);
            // console.info(msg);
            // console.info("------------------------------------------------------");
            msg = "";
            let contentLen ;
            for(let httpMsg of httpMsgs){
                console.info("i am in form===========");
                if(!httpMsg){
                    continue;
                }
                //1、判断对应请求头是否接收完毕;
                httpMsg = prefixMsg+httpMsg;
                console.info("before=============");
                console.info(httpMsg);
                console.info("after===============");
                let bodyStart = httpMsg.indexOf(newLine+newLine);
                console.info("bodyStart->"+bodyStart);
                if(bodyStart == -1){
                    //表明还没有完成;
                    msg = prefixMsg+httpMsg;
                    continue;
                }

                //请求头完成了。需要进行判读对应内容的长度
                let headObj = qs.parse(httpMsg,newLine,":");
                console.info("============start=====================");
                console.info(httpMsg);
                console.info("==========httpMsg end=================");
                console.info(headObj);
                console.info("===========headObj end================");
                
                if(!contentLen){
                    contentLen = headObj["Content-Length"];
                }
                if(contentLen == 0){
                    //表明响应没有数据;该情况理论上是不存在的;
                    console.error("接收到的内容体为空,请求的协议为->"+httpMsg);
                    continue;
                }
                //表明含有具体的数据了,需要判断对应内容体的长度是否到达content-length长度;
                //通过内容体进行判断数据是否接收完毕。如果没有接收完毕等待。否则直接解析
                const reviceMsg = httpMsg.substr(bodyStart+(newLine+newLine).length);
                console.info(`接收到的数据长队为->${new Buffer(reviceMsg).length },总共内容长度为->${contentLen}`);
                if(new Buffer(reviceMsg).length != contentLen){
                    //表明没有接收完全
                    msg = prefixMsg + httpMsg;
                    continue;
                }

                
                console.info(`======================单个协议接收 start(${moment().format('YYYY-MM-DD HH:mm:ss')})=====================`);
                console.info(reviceMsg);
                console.info("======================单个协议接收 end=====================");
                try{
                    const reviceObj = JSON.parse(reviceMsg);
                    console.info(`执行解析协议总共耗时->${new Date().getTime()-start}`);
                    self.ev.emit("reviceEventName",null,reviceObj);
                }catch(e){
                    console.error("解析接收的数据出错了,接收到的数据为->"+reviceMsg);
                    throw e;
                }
                


            }
            console.info(`*****************协议接收数据 end******************************`);
        });
    }
}
module.exports = HttpClient;



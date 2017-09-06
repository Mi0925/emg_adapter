/**
 *
 * http服务器。使用长连接;
 * 平台作为服务端进行接收底层上来数据;平台需要进行维护相关探针和对应连接之间关系
 * 对象处理流程:
 * 1、创建http长连接服务;
 * 2、具体探针上线直接连接后把相关连接放到map对象中
 * 3、对外提供根据探针IP进行获取对应连接处理;
 *
 * 对外提供的接口:
 * 根据IP获取对应连接地址;
 * findHttpConn(ip)
 *
 *
 * auth: liyangli
 * date: 17/5/24 下午2:29 .
 */
"use strict";
const os = require("os");
const net = require('net');
const fs = require("fs");
const qs = require('querystring');
const ev = require('../utils/event_adapter');
const setting = require('../config/setting');
const moment = require('moment');
const EventQueue = require("../utils/event_queue");


let msgID = 1;
const pratform = process.platform;
let newLine = "\n";
if (pratform == 'win32') {
    newLine = "\r\n";
}

/**
 * http服务器类
 * 主要提供对应服务。根据对应底层连接创建对应连接池;后续相关查询操作数据都进行直接在连接池中获取相关数据;
 */
class HttpServer {
    constructor() {
        //创建对应连接,http请求连接池
        this.connPool = new Map();
        this._initHttpServer();
    }

    /**
     * 对应事件绑定。目前http服务支持注册、注销两种事件的绑定;
     * 绑定方式为:
     * 注册: reject
     * 注销: destroy
     *
     * 对应回调中传递的数值为具体IP地址
     *
     * @param attr
     * @param cb
     */
    on(attr, cb) {
        ev.on(attr, cb);
    }

    /**
     * 初始化创建对应http长连接。
     * @private
     */
    _initHttpServer() {
        const setting = require("../config/setting");
        const self = this;
        //开始建立对应tcp连接;
        const server = net.createServer((c)=> {
            console.info("=============+++++++++++++++i am httpServer");
            const clientIP = c.remoteAddress;
            const tcpObj = self.connPool.get(clientIP);
            if (tcpObj) {
                //存在直接返回。不做任何处理
                return;
            }
            c.on('end', ()=> {
                //表明对应连接结束;
                self.connPool.delete(clientIP);
                console.info("客户端:" + clientIP + ",注销成功");
                ev.emit("destroy", clientIP);
            });

            c.on('close', ()=> {
                //表明通道断开了。需要移除掉。
                self.connPool.delete(clientIP);
                console.info("客户端:" + clientIP + ",注销成功");
                ev.emit("destroy", clientIP);
            });

            self.connPool.set(clientIP, c);
            //需要根据IP地址进行判断之前是否已经注册过。如果注册过需要进行下发对应输入、输出、输入输出路由信息;
            new ReceiveDeal(c);
            ev.emit("reject", clientIP);
            console.info("客户端:" + clientIP + ",注册成功");

        });

        server.on('error', (err)=> {
            throw err;
        });

        server.listen({host: '0.0.0.0', port: setting.udp.httpPort}, ()=> {
            console.info("tcp port bind...");
        });


    }


    /**
     * 根据IP地址进行获取对应http连接。如果不存在。进行增加日志说明;
     * @param ip 具体IP地址
     * @return reqObj 返回指定的连接对象
     */
    findHttpConn(ip, ev, protocolType) {
        const self = this;
        self.protocolType = protocolType;
        let reqObj = {
            flag: true,
            msg: '',
            httpConn: {},
            sendContent: {},
            msgID: 0,
            makeSendContent: function (sendContent) {
                sendContent.msgID = (msgID++);
                this.sendContent = sendContent;
                this.msgID = sendContent.msgID;
                sendContent.protocolType = self.protocolType;
                return sendContent.protocolType + "_" + sendContent.msgID;
            },
            send: function () {
                let attrEv = protocolType + "_" + reqObj.msgID;

                //增加超时处理;超时时间为配置文件中设定事件
                let timeout = setting.protocol.timeout;
                let startTime = new Date().getTime();
                //设置一个定时任务,定时去查看指定属性是否变化;变化后直接停止;
                let  finishEventName = attrEv + "_finish";
                let flag = false;
                var handler = setInterval(function () {
                    if (flag) {
                        return;
                    }
                    let nowTime = new Date().getTime();
                    if ((startTime + timeout) <= nowTime) {
                        flag = true;
                        clearInterval(handler);
                        ev.removeAllListeners(attrEv);
                        let err = `发送到IP:${ip},协议类型:${protocolType},,出现超时`;
                        ev.emit(attrEv, err, {});
                    }
                }, 100);

                //事件被返回了把定时任务给清除掉。并且修改对应属性

                //指定的超时时间内参数没有变化就直接触发attrEv事件

                //该事件作为一个透传事件使用;
                ev.on(finishEventName, (e, result)=> {
                    //注销掉对应事件
                    flag = true;
                    if (handler) {
                        clearInterval(handler);
                    }
                    ev.removeAllListeners(finishEventName);
                    let type = reviceObj.infoType;
                    let msgID = EventQueue.pop(type);
                    if(type == "ip.playstatus"){
                        ev.emit( type, e, result);
                    }else{
                        ev.emit( type + "_" + msgID, e, result);
                    }
                    
                });
                self._send(this.httpConn, this.sendContent);

            }
        };
        if (!ip) {
            reqObj.flag = false;
            reqObj.msg = "对应IP地址下不存在连接。请先确保对应设备在线";
        } else {
            reqObj.httpConn = this.connPool.get(ip);
        }

        //设定具体事件的监听处理
        if (!reqObj.httpConn) {
            return;
        }


        return reqObj;

    }


    /**
     * 发送具体的数据
     * @param conn
     * @param sendContent
     * @private
     * @return string 事件监听的属性;主要组成方式sendObj.protocolType+"_"+sendObj.msgID
     */
    _send(conn, sendContent) {
        sendContent = JSON.stringify(sendContent);
        //获取对一个字符长度
        let contentLen = new Buffer(sendContent).length;
        let msg = this._setHeader(contentLen) + newLine + sendContent;
        console.info("============_send===============");
        console.info(msg);
        conn.write(msg);
    }

    _setHeader(len) {
        var msg = `POST / HTTP/1.1 200 ok
Connection: keep-alive
Content-Length: ${len}
Accept: */*
Accept-Encoding: gzip, deflate
Accept-Language: zh,zh-CN;q=0.8,en;q=0.6${newLine}`;
        return msg;
    }

}
/**
 * 发送具体的数据。防止闭包情况下出现问题;
 */
class ReceiveDeal {
    constructor(httpConn) {
        this.httpConn = httpConn;
        this._receive();
    }

    _receive() {
        const self = this;

        //根据超时时间进行判断。如果下超时时间内没有响应数据就直接返回没有数据。否则直接返回对应数据;
        let msg = "";
        //设定一个对象。设定一个上下文数据;

        this.httpConn.on('data', (data)=> {
            //包含的场景:1、完整数据;2、不全数据;3、多个完整数据;4、多个数据但最后一个不完整


            //开启具体定时处理任务,如果尝试长时间没有设定表明就被重置了;
            msg += data.toString();
            //1、进行数据通过http头方式进行分割
            let prefixMsg = "HTTP/1.1 200 OK";
            const httpMsgs = msg.split(prefixMsg);
            //需要把msg 制空;主要针对后续数据在设定时再针对msg进行赋值;

            console.info(`*****************协议接收数据 start(${moment().format("YYYY-MM-DD HH:mm:ss")})******************************`);
            console.info(msg);
            console.info("------------------------------------------------------");
            msg = "";
            for (let httpMsg of httpMsgs) {
                if (!httpMsg) {
                    continue;
                }
                //1、判断对应请求头是否接收完毕;
                httpMsg = prefixMsg + httpMsg;
                let bodyStart = httpMsg.indexOf(newLine + newLine);
                if (bodyStart == -1) {
                    //表明还没有完成;
                    msg = prefixMsg + httpMsg;
                    continue;
                }

                //请求头完成了。需要进行判读对应内容的长度
                let headObj = qs.parse(httpMsg, "\n", ":");
                let contentLen = headObj["Content-Length"];
                if (contentLen == 0) {
                    //表明响应没有数据;该情况理论上是不存在的;
                    console.error("接收到的内容体为空,请求的协议为->" + httpMsg);
                    continue;
                }
                //表明含有具体的数据了,需要判断对应内容体的长度是否到达content-length长度;
                //通过内容体进行判断数据是否接收完毕。如果没有接收完毕等待。否则直接解析
                const reviceMsg = httpMsg.substr(bodyStart + (newLine + newLine).length);
                if (new Buffer(reviceMsg).length != contentLen) {
                    //表明没有接收完全
                    msg = prefixMsg + httpMsg;
                    continue;
                }


                console.info(`======================单个协议接收 start(${moment().format('YYYY-MM-DD HH:mm:ss')})=====================`);
                console.info(reviceMsg);
                console.info("======================单个协议接收 end=====================");
                try {
                    const reviceObj = JSON.parse(reviceMsg);
                    //获取最近一次的msgID;
                    let type = reviceObj.infoType;
                    let msgID = EventQueue.pop(type);
                    let attrEv = type + "_" + msgID;
                    let finishEventName = attrEv + "_finish";
                    ev.emit(finishEventName, null, reviceObj);
                } catch (e) {
                    console.error("解析接收的数据出错了,接收到的数据为->" + reviceMsg);
                    throw e;
                }


            }
            console.info(`*****************协议接收数据 end******************************`);
        });
    }
}

module.exports = new HttpServer();


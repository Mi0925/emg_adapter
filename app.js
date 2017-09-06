'use strict';
/**
 * 程序入口对象。作为门面模式中中心对象。负责功能分发s
 */

 const HttpClient = require("./http_client/http_client_keep");
 const setting = require("./config/setting");
 const EventEmmiter = require("events");
class Main{
    
    constructor(){
        this.ev = new EventEmmiter();
    }
    main(){
        
        /**
         * 入口方法；
         * 处理步骤：
         * 1、进行获取配置文件中需要连接的路径；
         * 2、进行连接指定服务器，模拟心跳协议定时发送；
         * 3、接收到的数据进行打印出来，显示接收协议内容；
         * 4、接收协议后进行响应协议；如果是状态查询协议。则通过定时任务进行模拟定时发送状态数据；
         */
        let webIP = setting.webIP;
        let wepPort = setting.webPort;
        let timeOut = setting.protocol.timeout;

        //建立连接
        let httpClient = new HttpClient(webIP,wepPort,timeOut,this.ev);
        //进行开始具体任务，发送心跳数据给平台
        this._headert(httpClient);
        
    }

    /**
     * 通过定时任务进行上报心跳。周期为每5秒执行一次
     */
    _headert(httpClient){
        let sendContent = 
        {
            infoType: "ip.device.info",
            devices:[
                {
                    ip: "172.17.9.101",
                            frequency: 15,
                    rssi: 1,
                    status: 1,
                    desc: "具体的故障信息"
                },
                {
                    ip: "172.17.9.102",
                            frequency: 15,
                    rssi: 1,
                    status: 15,
                    desc: "具体的故障信息"
                }
                ]
            }
        // setInterval(function(){
        //     //开始发送心跳协议
        //     httpClient.send(sendContent);
        // },5*1000);
    }
}


let main = new Main();
main.main();
module.exports = Main;
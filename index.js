const { EventEmitterAsyncResource } = require('events');
const fetch = require('node-fetch');
const WebSocket = require('ws');
const colors = require('colors');
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));

colors.setTheme({
    info: ['grey', 'bold'],
    error: ['red', 'bold'],
    success: ['green', 'italic'],
    warning: ['yellow', 'bold']
});

class Sniper {
    constructor() {
        this.guilds = {};
        this.connectWebSocket();
        this.updateTitle();
    }

    connectWebSocket() {
        this.socket = new WebSocket('wss://gateway.discord.gg/?v=9&encoding=json&shard=0&shardcount=1&region=afg-east');
        this.socket.on('open', async () => {
            this.socket.send(JSON.stringify({
                op: 2,
                d: {
                    token: config.token,
                    intents: 513,
                    properties: {
                        os: 'macos',
                        browser: 'Safari',
                        device: 'MacBook Air'
                    }
                }
            }));
            this.sendHeartbeat();
        });
        this.socket.on('close', () => {
            console.log('Connection closed.'.error);
            setTimeout(() => {
                this.connectWebSocket();
            }, 100);
        });
        this.socket.on('message', async message => {
            const data = JSON.parse(message);
            switch (data.t) {
                case 'GUILD_UPDATE':
                    this.handleGuildUpdate(data.d);
                    break;
                case 'READY':
                    this.handleReady(data.d);
                    break;
                case 'GUILD_CREATE':
                    this.handleGuildCreate(data.d);
                    break;
                case 'GUILD_DELETE':
                    this.handleGuildDelete(data.d);
                    break;
            }
        });
        this.socket.on('error', error => {
            console.error(error);
            process.exit(1);
        });
    }

    sendHeartbeat() {
        setInterval(() => {
            this.socket.send(JSON.stringify({
                op: 0,
                d: null
            }));
        }, 41250);
    }

    handleGuildUpdate(guildData) {
        const guild = this.guilds[guildData.guild_id];
        if (guild?.vanity_url_code && guild.vanity_url_code !== guildData.vanity_url_code) {
            this.snipeVanityURL(guild.vanity_url_code, guildData.guild_id);
        }
    }

    async snipeVanityURL(vanityCode, guildId, delay = Math.floor(Math.random() * 6)) {
        try {
            const startTime = Date.now();
            const response = await fetch(`https://canary.discord.com/api/v10/guilds/${config.serverId}/vanity-url`, {
                method: 'PATCH',
                body: JSON.stringify({ code: vanityCode }),
                headers: {
                    'Authorization': config.token,
                    'Content-Type': 'application/json'
                }
            });
            const elapsedTime = Date.now() - startTime;
            if (response.ok) {
                console.log(`Success: ${vanityCode} in ${elapsedTime}ms`.success);
                this.sendWebhookRequest(config.webhookUrl, {
                    title: 'Success',
                    description: `Vanity URL: ${vanityCode}\nTime: ${elapsedTime}ms`,
                    color: 0x00ff00
                });
            } else {
                console.error(`Failed: ${vanityCode}`);
                this.sendWebhookRequest(config.webhookUrl, {
                    title: 'Failed',
                    description: `Vanity URL: ${vanityCode}\nStatus: ${response.status}`,
                    color: 0xff0000
                });
            }
            delete this.guilds[guildId];
        } catch (error) {
            console.error(`Error sniping vanity URL: ${vanityCode}`, error);
            delete this.guilds[guildId];
        }
    }

    handleReady(data) {
        data.guilds.forEach(guild => {
            if (typeof guild.vanity_url_code === 'string') {
                this.guilds[guild.id] = {
                    vanity_url_code: guild.vanity_url_code,
                    boostCount: guild.premium_subscription_count
                };
                this.printGuildInfo(guild);
            }
        });
        this.updateTitle();
    }

    handleGuildCreate(guild) {
        this.guilds[guild.id] = { vanity_url_code: guild.vanity_url_code };
        this.printGuildInfo(guild);
        this.updateTitle();
    }

    handleGuildDelete(guild) {
        const guildData = this.guilds[guild.id];
        setTimeout(() => {
            if (guildData?.vanity_url_code) {
                this.snipeVanityURL(guildData.vanity_url_code, guild.id);
            }
        }, 50);
    }

    updateTitle() {
        const guildCount = Object.keys(this.guilds).length;
        process.title = `Sniper - ${guildCount} guilds`;
    }

    printGuildInfo(guild) {
        console.log(`> URL: ${guild.vanity_url_code} | ID: ${config.serverId} | Server: ${guild.name} | Boosts: ${guild.premium_subscription_count}`.info);
    }

    async sendWebhookRequest(webhookUrl, content) {
        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ embeds: [content] })
            });
            if (!response.ok) {
                console.error(`Webhook request failed: ${response.status}`);
            }
        } catch (error) {
            console.error('Error sending webhook request:', error);
        }
    }
}

const sniper = new Sniper();

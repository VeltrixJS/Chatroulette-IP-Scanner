// ==UserScript==
// @name         Chatroulette IP Scanner
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  IP Tracker for Chatroulette
// @author       VeltrixJS
// @match        https://chatroulette.com/*
// @match        https://*.chatroulette.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=chatroulette.com
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        COLORS: {
            primary: '#ffd22e',
            dark: '#121212',
            white: '#ffffff',
            gray: '#1c1c1c',
            border: '#222',
            red: '#ff4444'
        }
    };

    const state = {
        myIPs: new Set(),
        sessionIPs: new Map(),
        shownIPs: new Set(),
        rtcCount: 0,
        elements: {},
        isReady: false,
        lastConnectionTime: 0,
        popup: null,
        initTimeout: null
    };

    const utils = {
        isPublicIP(ip) {
            if (!ip || ip === '0.0.0.0') return false;
            const privatePatterns = [/^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^192\.168\./, /^127\./, /^169\.254\./];
            return !privatePatterns.some(p => p.test(ip));
        },

        isKnownServerIP(ip) {
            const knownServers = ['206.81.27', '102.105.120', '81.49.17', '154.127.57', '142.250', '172.217', '216.58', '74.125'];
            return knownServers.some(prefix => ip.startsWith(prefix));
        },

        extractIPs(candidateStr) {
            const ipRegex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
            const matches = candidateStr.match(ipRegex) || [];
            const validIPs = [];
            const parts = candidateStr.split(' ');
            const type = parts[7] || 'unknown';

            for (const ip of matches) {
                if (!utils.isPublicIP(ip)) continue;
                if (utils.isKnownServerIP(ip)) continue;
                if (state.myIPs.has(ip)) continue;
                validIPs.push({ ip, type });
            }

            return validIPs;
        },

        async fetchGeo(ip) {
            const apis = [
                {
                    url: `http://ip-api.com/json/${ip}?fields=country,regionName,city,zip,isp,proxy,hosting`,
                    parse: (d) => ({
                        city: d.city || 'Unknown',
                        region: d.regionName || 'Unknown',
                        postal: d.zip || '',
                        country: d.country || 'Unknown',
                        isp: d.isp || 'N/A',
                        vpn: d.proxy || d.hosting || false
                    })
                },
                {
                    url: `https://ipapi.co/${ip}/json/`,
                    parse: (d) => ({
                        city: d.city || 'Unknown',
                        region: d.region || 'Unknown',
                        postal: d.postal || '',
                        country: d.country_name || 'Unknown',
                        isp: d.org || 'N/A',
                        vpn: false
                    })
                }
            ];

            for (const api of apis) {
                try {
                    const res = await Promise.race([
                        fetch(api.url).then(r => r.json()),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
                    ]);

                    if (res && res.status !== 'fail' && !res.error) {
                        return api.parse(res);
                    }
                } catch (e) {}
            }

            return { city: 'Unknown', region: 'Unknown', postal: '', country: 'Unknown', isp: 'N/A', vpn: false };
        },

        createDisplay(ip, data, time) {
            const { city = 'Unknown', region = 'Unknown', postal = '', country = 'Unknown', isp = 'N/A', vpn = false } = data || {};
            const dept = (postal && postal.length >= 2) ? postal.substring(0, 2) : '??';
            const vpnBadge = vpn ? `<span style="background:${CONFIG.COLORS.red};color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;margin-left:8px;">🚨 VPN/PROXY</span>` : '';
            const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(city + ' ' + country)}`;
            const itemStyle = `display:flex;flex-direction:column;background-color:${CONFIG.COLORS.gray};border-left:4px solid ${CONFIG.COLORS.primary};padding:15px;margin-bottom:12px;border-radius:8px;color:${CONFIG.COLORS.white};`;
            const btnStyle = `padding:8px;border:none;background:${CONFIG.COLORS.primary};color:${CONFIG.COLORS.dark};border-radius:6px;cursor:pointer;font-weight:600;transition:all 0.2s;`;

            const item = document.createElement('div');
            item.style.cssText = itemStyle;
            item.innerHTML = `
                <div style="margin-bottom:8px;font-size:12px;opacity:0.6">Detected at: ${time}</div>
                <div style="margin-bottom:4px"><strong style="color:${CONFIG.COLORS.primary}">IP:</strong> ${ip}${vpnBadge}</div>
                <div style="margin-bottom:4px"><strong style="color:${CONFIG.COLORS.primary}">ISP:</strong> ${isp}</div>
                <div style="margin-bottom:12px"><strong style="color:${CONFIG.COLORS.primary}">LOC:</strong> ${city}, ${region} (${dept}) - ${country}</div>
                <div style="display:flex;gap:8px">
                    <button class="copy-btn" style="${btnStyle}flex:1">Copy</button>
                    <button class="maps-btn" style="${btnStyle}flex:1;background:${CONFIG.COLORS.white};color:${CONFIG.COLORS.dark}">Maps</button>
                </div>
            `;

            item.querySelector('.copy-btn').onclick = () => {
                navigator.clipboard.writeText(ip);
                const btn = item.querySelector('.copy-btn');
                btn.textContent = '✓ Copied!';
                setTimeout(() => btn.textContent = 'Copy', 1500);
            };

            item.querySelector('.maps-btn').onclick = () => window.open(mapsUrl, '_blank');

            return {
                element: item,
                html: `<div class="ip-item"><div class="time-label">Detected at: ${time}</div><div class="info-line"><strong>IP:</strong> ${ip}${vpnBadge}</div><div class="info-line"><strong>ISP:</strong> ${isp}</div><div class="info-line" style="margin-bottom:12px"><strong>LOC:</strong> ${city}, ${region} (${dept}) - ${country}</div><div class="ip-buttons"><button onclick="navigator.clipboard.writeText('${ip}')">Copy</button><button class="maps-btn" onclick="window.open('${mapsUrl}','_blank')">Maps</button></div></div>`
            };
        },

        displayIP(ip, type) {
            if (state.shownIPs.has(ip)) return;

            state.shownIPs.add(ip);
            const time = new Date().toLocaleTimeString();
            const tempData = { city: 'Loading...', region: 'Loading...', postal: '', country: 'Loading...', isp: 'Loading...', vpn: false };
            const { element, html } = utils.createDisplay(ip, tempData, time);

            if (state.elements.ipAddresses) {
                state.elements.ipAddresses.innerHTML = '';
                state.elements.ipAddresses.appendChild(element);
            }

            if (state.popup && !state.popup.closed) {
                state.popup.document.getElementById('ip-addresses').innerHTML = html;
            }

            utils.fetchGeo(ip).then(data => {
                const { element: newElement, html: newHtml } = utils.createDisplay(ip, data, time);

                if (state.elements.ipAddresses) {
                    state.elements.ipAddresses.innerHTML = '';
                    state.elements.ipAddresses.appendChild(newElement);
                }

                if (state.popup && !state.popup.closed) {
                    state.popup.document.getElementById('ip-addresses').innerHTML = newHtml;
                }
            });
        },

        openPopup() {
            if (state.popup && !state.popup.closed) {
                state.popup.focus();
                return;
            }

            state.popup = window.open('', 'IPTracker', 'width=420,height=380,left=100,top=100');
            state.popup.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Chatroulette IP Tracker</title>
                    <style>
                        body {
                            margin: 0;
                            padding: 20px;
                            background: ${CONFIG.COLORS.dark};
                            font-family: Inter, Arial, sans-serif;
                            color: ${CONFIG.COLORS.white};
                        }
                        h3 {
                            margin: 0 0 20px;
                            color: ${CONFIG.COLORS.primary};
                            text-transform: uppercase;
                            font-size: 18px;
                            font-weight: 800;
                            letter-spacing: 1px;
                        }
                        .ip-item {
                            display: flex;
                            flex-direction: column;
                            background-color: ${CONFIG.COLORS.gray};
                            border-left: 4px solid ${CONFIG.COLORS.primary};
                            padding: 15px;
                            margin-bottom: 12px;
                            border-radius: 8px;
                            color: ${CONFIG.COLORS.white};
                        }
                        .ip-item strong {
                            color: ${CONFIG.COLORS.primary};
                            margin-right: 5px;
                        }
                        .time-label {
                            margin-bottom: 8px;
                            font-size: 12px;
                            opacity: 0.6;
                        }
                        .info-line {
                            margin-bottom: 4px;
                        }
                        .ip-buttons {
                            display: flex;
                            gap: 8px;
                            margin-top: 12px;
                        }
                        button {
                            padding: 8px;
                            border: none;
                            background: ${CONFIG.COLORS.primary};
                            color: ${CONFIG.COLORS.dark};
                            border-radius: 6px;
                            cursor: pointer;
                            font-weight: 600;
                            flex: 1;
                        }
                        button:hover {
                            opacity: 0.8;
                            transform: translateY(-1px);
                        }
                        .maps-btn {
                            background: ${CONFIG.COLORS.white} !important;
                            color: ${CONFIG.COLORS.dark} !important;
                        }
                        .github-link {
                            display: inline-flex;
                            align-items: center;
                            gap: 8px;
                            background: ${CONFIG.COLORS.border};
                            color: ${CONFIG.COLORS.primary};
                            border: 1px solid ${CONFIG.COLORS.primary};
                            padding: 8px 16px;
                            text-decoration: none;
                            font-weight: 600;
                            border-radius: 8px;
                            font-size: 12px;
                            transition: all 0.2s;
                            margin-top: 15px;
                        }
                        .github-link:hover {
                            background: ${CONFIG.COLORS.primary};
                            color: ${CONFIG.COLORS.dark};
                        }
                    </style>
                </head>
                <body>
                    <div id="ip-container">
                        <h3>Live IP Tracker</h3>
                        <div id="ip-addresses"></div>
                        <div style="text-align:center">
                            <a href="https://github.com/VeltrixJS" target="_blank" class="github-link">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.757-1.333-1.757-1.089-.744.084-.729.084-.729 1.205.084 1.84 1.236 1.84 1.236 1.07 1.835 2.809 1.304 3.495.997.108-.775.418-1.305.762-1.605-2.665-.305-5.466-1.332-5.466-5.93 0-1.31.469-2.381 1.236-3.221-.124-.303-.535-1.523.117-3.176 0 0 1.008-.322 3.301 1.23a11.5 11.5 0 013.003-.404c1.018.005 2.045.138 3.003.404 2.292-1.552 3.298-1.23 3.298-1.23.653 1.653.242 2.873.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.61-2.803 5.624-5.475 5.921.43.372.823 1.102.823 2.222 0 1.606-.015 2.896-.015 3.286 0 .319.218.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
                                GitHub
                            </a>
                        </div>
                    </div>
                </body>
                </html>
            `);
            state.popup.document.close();
        }
    };

    const OriginalRTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;

    if (OriginalRTC) {
        window.RTCPeerConnection = function(...args) {
            const now = Date.now();

            if (now - state.lastConnectionTime > 2000) {
                state.rtcCount++;

                if (state.rtcCount === 1 && !state.isReady) {
                    if (state.initTimeout) clearTimeout(state.initTimeout);
                    state.initTimeout = setTimeout(() => {
                        state.isReady = true;
                    }, 1000);
                } else if (state.isReady) {
                    state.sessionIPs.clear();
                }
            }

            state.lastConnectionTime = now;

            const pc = new OriginalRTC(...args);

            const processCandidate = (candidateString) => {
                if (!candidateString) return;

                const validIPs = utils.extractIPs(candidateString);

                if (!state.isReady) {
                    validIPs.forEach(ipData => state.myIPs.add(ipData.ip));
                } else {
                    validIPs.forEach(ipData => {
                        if (!state.sessionIPs.has(ipData.ip)) {
                            state.sessionIPs.set(ipData.ip, ipData);
                            utils.displayIP(ipData.ip, ipData.type);
                        }
                    });
                }
            };

            const origAdd = pc.addIceCandidate.bind(pc);
            pc.addIceCandidate = async function(candidate, ...rest) {
                if (candidate?.candidate) processCandidate(candidate.candidate);
                return origAdd(candidate, ...rest);
            };

            const origOnIce = pc.onicecandidate;
            pc.onicecandidate = function(event) {
                if (event?.candidate?.candidate) processCandidate(event.candidate.candidate);
                if (origOnIce) origOnIce.call(this, event);
            };

            const origAddEvent = pc.addEventListener.bind(pc);
            pc.addEventListener = function(type, listener, ...rest) {
                if (type === 'icecandidate') {
                    const wrapped = function(event) {
                        if (event?.candidate?.candidate) processCandidate(event.candidate.candidate);
                        return listener.call(this, event);
                    };
                    return origAddEvent('icecandidate', wrapped, ...rest);
                }
                return origAddEvent(type, listener, ...rest);
            };

            return pc;
        };

        window.RTCPeerConnection.prototype = OriginalRTC.prototype;
    }

    function createUI() {
        const btnStyle = `padding:8px;border:none;background:${CONFIG.COLORS.primary};color:${CONFIG.COLORS.dark};border-radius:6px;cursor:pointer;font-weight:600;transition:all 0.2s;`;

        const container = document.createElement('div');
        container.id = 'ip-container';
        container.innerHTML = `
            <div id="drag-handle" style="cursor:move;margin-bottom:20px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <h3 style="margin:0;color:${CONFIG.COLORS.primary};font-weight:800;text-transform:uppercase;letter-spacing:1px;">Detected IP</h3>
                    <div style="display:flex;gap:8px;">
                        <button id="open-popup" style="${btnStyle}background:transparent;border:1px solid ${CONFIG.COLORS.primary};color:${CONFIG.COLORS.primary};font-size:12px;">📺 POPUP</button>
                        <button id="close-ip-container" style="${btnStyle}font-weight:bold;">X</button>
                    </div>
                </div>
            </div>
            <div id="ip-addresses"></div>
            <div style="margin-top:15px;text-align:center;">
                <a href="https://github.com/VeltrixJS" target="_blank" style="display:inline-flex;align-items:center;gap:8px;background:${CONFIG.COLORS.border};color:${CONFIG.COLORS.primary};border:1px solid ${CONFIG.COLORS.primary};padding:8px 16px;text-decoration:none;font-weight:600;border-radius:8px;font-size:12px;transition:all 0.2s;" onmouseover="this.style.backgroundColor='${CONFIG.COLORS.primary}';this.style.color='${CONFIG.COLORS.dark}';" onmouseout="this.style.backgroundColor='${CONFIG.COLORS.border}';this.style.color='${CONFIG.COLORS.primary}';">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.757-1.333-1.757-1.089-.744.084-.729.084-.729 1.205.084 1.84 1.236 1.84 1.236 1.07 1.835 2.809 1.304 3.495.997.108-.775.418-1.305.762-1.605-2.665-.305-5.466-1.332-5.466-5.93 0-1.31.469-2.381 1.236-3.221-.124-.303-.535-1.523.117-3.176 0 0 1.008-.322 3.301 1.23a11.5 11.5 0 013.003-.404c1.018.005 2.045.138 3.003.404 2.292-1.552 3.298-1.23 3.298-1.23.653 1.653.242 2.873.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.61-2.803 5.624-5.475 5.921.43.372.823 1.102.823 2.222 0 1.606-.015 2.896-.015 3.286 0 .319.218.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg> GitHub
                </a>
            </div>
        `;

        Object.assign(container.style, {
            position: 'fixed',
            top: '10px',
            right: '10px',
            width: '400px',
            maxHeight: '500px',
            backgroundColor: CONFIG.COLORS.dark,
            border: `1px solid ${CONFIG.COLORS.primary}`,
            borderRadius: '16px',
            padding: '20px',
            zIndex: '10000',
            fontFamily: 'Inter, Arial, sans-serif',
            fontSize: '14px',
            boxShadow: `0 8px 32px rgba(255,210,46,0.2)`,
            color: CONFIG.COLORS.white,
            resize: 'both',
            overflow: 'auto'
        });

        document.body.appendChild(container);

        const miniBtn = document.createElement('div');
        miniBtn.id = 'mini-ip-container';
        miniBtn.innerHTML = `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="${CONFIG.COLORS.primary}" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;

        Object.assign(miniBtn.style, {
            position: 'fixed',
            top: '10px',
            right: '10px',
            width: '50px',
            height: '50px',
            backgroundColor: CONFIG.COLORS.dark,
            border: `2px solid ${CONFIG.COLORS.primary}`,
            borderRadius: '50%',
            zIndex: '10000',
            cursor: 'pointer',
            display: 'none',
            justifyContent: 'center',
            alignItems: 'center',
            boxShadow: `0 0 15px ${CONFIG.COLORS.primary}66`
        });

        document.body.appendChild(miniBtn);

        state.elements = {
            container,
            ipAddresses: container.querySelector('#ip-addresses'),
            miniBtn
        };

        document.getElementById('open-popup').onclick = () => utils.openPopup();

        document.getElementById('close-ip-container').onclick = () => {
            miniBtn.style.top = container.offsetTop + 'px';
            miniBtn.style.left = container.offsetLeft + 'px';
            container.style.display = 'none';
            miniBtn.style.display = 'flex';
        };

        const makeDrag = (el, handle) => {
            let pos = { x: 0, y: 0, mx: 0, my: 0 };
            let dragState = { active: false, startX: 0, startY: 0 };

            handle.onmousedown = (e) => {
                e.preventDefault();
                dragState = { active: false, startX: e.clientX, startY: e.clientY };
                pos.mx = e.clientX;
                pos.my = e.clientY;

                document.onmouseup = () => {
                    document.onmousemove = null;
                    document.onmouseup = null;

                    if (el.id === 'mini-ip-container' && !dragState.active) {
                        container.style.top = miniBtn.offsetTop + 'px';
                        container.style.left = miniBtn.offsetLeft + 'px';
                        container.style.display = 'block';
                        miniBtn.style.display = 'none';
                    }
                };

                document.onmousemove = (e) => {
                    if (Math.abs(e.clientX - dragState.startX) > 5 || Math.abs(e.clientY - dragState.startY) > 5) {
                        dragState.active = true;
                    }

                    pos.x = pos.mx - e.clientX;
                    pos.y = pos.my - e.clientY;
                    pos.mx = e.clientX;
                    pos.my = e.clientY;
                    el.style.top = (el.offsetTop - pos.y) + "px";
                    el.style.left = (el.offsetLeft - pos.x) + "px";
                };
            };
        };

        makeDrag(container, document.getElementById('drag-handle'));
        makeDrag(miniBtn, miniBtn);
    }

    const initInterval = setInterval(() => {
        if (document.body) {
            clearInterval(initInterval);
            createUI();
        }
    }, 100);

})();

// service-worker.js - Unlimited Waifu2x UWP 离线缓存策略
const CACHE_NAME = 'waifu2x-uwp-cache-v1';
const PRECACHE_URLS = [
  './',
  './index.html',
  './css/Inter.css',
  './js/jquery.min.js',
  './js/jquery.cookie.js',
  './js/ort.min.js',
  './js/script.js',
  './blank.png',
  './favicon.ico',
  './img/favicon-128.png',
  './img/favicon-192.png',
  './img/favicon-512.png',
  './manifest.json',
  './gtag.js',                               // 新增
  './ort-wasm-simd-threaded.wasm',           // 新增
  './ort-wasm-simd.wasm',                    // 新增
  './ort-wasm.wasm'                          // 新增
];

// 安装阶段：预缓存核心静态资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// 激活阶段：清理旧版本缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// 请求拦截：网络优先，失败时回退缓存；模型文件（.onnx/.art）采用网络优先但不缓存过大资源
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 对于模型文件（.art / .onnx）以及可能的大型wasm，使用网络优先且不主动缓存，避免浪费空间
  if (url.pathname.endsWith('.art') || url.pathname.endsWith('.onnx') || url.pathname.includes('/models/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // 如果模型文件完全无法获取，则尝试从缓存获取（一般不期望缓存大文件）
        return caches.match(event.request);
      })
    );
    return;
  }

  // 对于 HTML 页面，使用网络优先并更新缓存（确保最新内容）
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 对于静态资源（css, js, wasm, 图片等）：缓存优先，提升离线性能
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // 后台更新缓存（stale-while-revalidate）
          fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, networkResponse);
              });
            }
          }).catch(() => {});
          return cachedResponse;
        }
        return fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
          // 完全离线且无缓存时，可返回自定义离线页面，此处返回基础响应
          return new Response('您当前处于离线状态，请检查网络连接。', { status: 503 });
        });
      })
  );
});

import React, { useRef, useEffect, useState, useCallback } from "react";

/**
 * Map Container component
 *
 * 使用原生 Google Maps JavaScript API 初始化地图，加入安全检查和异步重试机制，
 * 避免因脚本未完全加载导致 "Map is not a constructor" 错误。
 *
 * 配置：
 *  - 中心点：多伦多 { lat: 43.6532, lng: -79.3832 }
 *  - 缩放级别：12
 */
const MapContainer = ({
  center = { lat: 43.6532, lng: -79.3832 },
  zoom = 12,
  mapOptions,
  onMapInstance,
  children,
  ...rest
}) => {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const [map, setMap] = useState(null);
  const [loadError, setLoadError] = useState(null);

  /**
   * handleComponentMount — 安全创建 Google Map 实例
   *
   * 实现要点：
   *  1. 安全检查：在执行 new window.google.maps.Map 之前检查
   *     window.google / window.google.maps 是否已定义
   *  2. 异步重试：若未就绪则 200ms 后重试（最多重试 maxRetries 次）
   *  3. 错误处理：用 try…catch 捕获初始化异常
   *  4. 初始化成功后通过 onMapInstance 回调暴露实例
   */
  const handleComponentMount = useCallback(
    (retries = 0, maxRetries = 15) => {
      // 安全检查：确认 Google Maps 库已完全加载
      if (
        typeof window === "undefined" ||
        typeof window.google !== "object" ||
        typeof window.google.maps !== "object" ||
        typeof window.google.maps.Map !== "function"
      ) {
        if (retries < maxRetries) {
          // 异步重试：200ms 后再次尝试初始化
          setTimeout(() => {
            handleComponentMount(retries + 1, maxRetries);
          }, 200);
          return;
        }

        // 超过最大重试次数，记录错误并展示 fallback UI
        const errMsg =
          "Google Maps library failed to load after " +
          (maxRetries * 200) +
          "ms. window.google.maps.Map is not available.";
        console.error("[MapContainer]", errMsg);
        setLoadError(new Error(errMsg));
        return;
      }

      // 容器 DOM 节点必须存在
      if (!containerRef.current) {
        const errMsg = "Map container DOM node is not available.";
        console.error("[MapContainer]", errMsg);
        setLoadError(new Error(errMsg));
        return;
      }

      try {
        // 避免重复初始化
        if (mapRef.current) return;

        const mapInstance = new window.google.maps.Map(
          containerRef.current,
          {
            center,
            zoom,
            fullscreenControl: false,
            streetViewControl: false,
            mapTypeControl: false,
            ...mapOptions,
          }
        );

        mapRef.current = mapInstance;
        setMap(mapInstance);
        setLoadError(null);

        // 将地图实例暴露给父组件
        if (typeof onMapInstance === "function") {
          onMapInstance(mapInstance);
        }
      } catch (error) {
        console.error("[MapContainer] Error initializing map:", error);
        setLoadError(error);

        // 捕获异常后自动重试一次（可能由于竞态条件导致暂时不可用）
        if (retries < 1) {
          setTimeout(() => {
            handleComponentMount(retries + 1, maxRetries);
          }, 200);
        }
      }
    },
    [center, zoom, mapOptions, onMapInstance]
  );

  useEffect(() => {
    // 组件挂载时开始初始化流程
    handleComponentMount();

    return () => {
      // 组件卸载时清理地图实例
      if (mapRef.current && typeof window.google?.maps?.event === "object") {
        window.google.maps.event.clearInstanceListeners(mapRef.current);
      }
      mapRef.current = null;
    };
  }, [handleComponentMount]);

  // 加载失败时显示友好的错误提示
  if (loadError) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          color: "#666",
          fontSize: 14,
          padding: 16,
          textAlign: "center",
        }}
      >
        <p>Failed to load Google Maps.</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>
          Please check your network connection and try refreshing the page.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ height: "100%", width: "100%" }}
      {...rest}
    >
      {children}
    </div>
  );
};

export default MapContainer;

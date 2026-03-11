import * as BABYLON from "@babylonjs/core";

export class EarthController {
  private engine!: BABYLON.Engine | BABYLON.WebGPUEngine;
  private scene!: BABYLON.Scene;
  private material!: BABYLON.ShaderMaterial;
  private earthMesh!: BABYLON.Mesh;
  private sunDirection: BABYLON.Vector3 = new BABYLON.Vector3(1, 0, 0);
  private time: number = 0;


  constructor(private canvas: HTMLCanvasElement) {}

  async init() {
    if (await BABYLON.WebGPUEngine.IsSupportedAsync) {
      const wgpu = new BABYLON.WebGPUEngine(this.canvas);
      await wgpu.initAsync();
      this.engine = wgpu;
    } else {
      this.engine = new BABYLON.Engine(this.canvas, true);
    }

    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);

    const camera = new BABYLON.ArcRotateCamera(
      "cam",
      -Math.PI / 2,
      Math.PI / 2.5,
      5,
      BABYLON.Vector3.Zero(),
      this.scene,
    );
    camera.attachControl(this.canvas, true);

    camera.lowerRadiusLimit = 2.2;
    camera.upperRadiusLimit = 15;
    camera.wheelPrecision = 120;
    camera.inertia = 0.9;
    this.setupShaders();
    this.setupEarth();
    this.startLoop();
    // this.drawEquator();
    // this.drawPrimeMeridian();
    // this.drawGrid();
    // this.drawLongitudeLines();
    // this.drawLatitudeLines();
  }

  private setupShaders() {
    BABYLON.Effect.ShadersStore["earthDayNightFragmentShader"] = `
            precision highp float;
            varying vec2 vUV;
            varying vec3 vNormalW;
            varying vec3 vPositionW;
            uniform sampler2D dayTexture;
            uniform sampler2D nightTexture;
            uniform sampler2D cloudTexture;
            uniform sampler2D normalTexture;
            uniform sampler2D specularTexture;
            uniform vec3 sunDir;
            uniform vec3 cameraPosition;
            uniform float time;

            void main(void) {
                vec3 viewDir = normalize(cameraPosition - vPositionW);
                vec3 lightDir = normalize(sunDir);
                vec3 normalDetail = texture2D(normalTexture, vUV).rgb * 2.0 - 1.0;
                vec3 perturbedNormal = normalize(vNormalW + normalDetail * 0.1); 
                float intensity = dot(perturbedNormal, lightDir);
                float mixer = smoothstep(-0.3, 0.3, intensity);

                vec4 dayColor = texture2D(dayTexture, vUV);
                vec4 nightColor = texture2D(nightTexture, vUV);
                
                float nightBrightness = 0.4;
                float nightContrast = 1.2;
                vec3 enhancedNight = (nightColor.rgb * nightContrast) + vec3(nightBrightness * nightColor.r); 
                vec3 ambientColor = vec3(0.05, 0.06, 0.1) * (1.0 - mixer);
                vec3 reflectDir = reflect(-lightDir, perturbedNormal);
                float specFactor = pow(max(dot(viewDir, reflectDir), 0.0), 20.0);
                float oceanMask = texture2D(specularTexture, vUV).r;
                vec3 specular = vec3(0.4) * specFactor * oceanMask * mixer;

                vec2 cloudUV = vUV + vec2(time * 0.005, 0.0);
                vec4 cloudColor = texture2D(cloudTexture, cloudUV);
                
                vec3 baseColor = mix(enhancedNight, dayColor.rgb, mixer);
                float cloudMixer = cloudColor.r;
                vec3 cloudEffect = mix(cloudColor.rgb * 0.15, cloudColor.rgb, mixer);
                baseColor = mix(baseColor, cloudEffect, cloudMixer * 0.8);

                // gl_FragColor = vec4(baseColor + specular, 1.0);
                gl_FragColor = vec4(baseColor + ambientColor + specular, 1.0);
            }
        `;

    BABYLON.Effect.ShadersStore["earthDayNightVertexShader"] = `
            precision highp float;
            attribute vec3 position;
            attribute vec2 uv;
            attribute vec3 normal;
            uniform mat4 worldViewProjection;
            uniform mat4 world;
            varying vec2 vUV;
            varying vec3 vNormalW;
            varying vec3 vPositionW;

            void main(void) {
                vec4 worldPos = world * vec4(position, 1.0);
                gl_Position = worldViewProjection * worldPos;
                // gl_Position = worldViewProjection * vec4(position, 1.0);
                // vUV = uv;
                
                vUV = vec2(1.0 - uv.x, 1.0 - uv.y); 
                
                vNormalW = vec3(world * vec4(normal, 0.0));
                vPositionW = worldPos.xyz;
            }
        `;
  }

  private setupEarth() {
    this.earthMesh = BABYLON.MeshBuilder.CreateSphere(
      "earth",
      { segments: 64, diameter: 2 },
      this.scene,
    );
    this.material = new BABYLON.ShaderMaterial(
      "earthShader",
      this.scene,
      {
        vertex: "earthDayNight",
        fragment: "earthDayNight",
      },
      {
        attributes: ["position", "normal", "uv"],
        uniforms: [
          "world",
          "worldViewProjection",
          "sunDir",
          "cameraPosition",
          "time",
        ],
        samplers: [
          "dayTexture",
          "nightTexture",
          "cloudTexture",
          "normalTexture",
          "specularTexture",
        ],
      },
    );
    this.earthMesh.material = this.material;
  }

  /**
   * 将经纬度转换为 3D 空间坐标
   */
  private latLonToVector3(
    lat: number,
    lon: number,
    radius: number = 1.01,
  ): BABYLON.Vector3 {
    const latRad = BABYLON.Tools.ToRadians(lat);
    // 这里直接写 -lon 配合 Shader 镜像
    const lonRad = BABYLON.Tools.ToRadians(-lon - 90);

    const x = radius * Math.cos(latRad) * Math.sin(lonRad);
    const y = radius * Math.sin(latRad);
    const z = radius * Math.cos(latRad) * Math.cos(lonRad);

    return new BABYLON.Vector3(x, y, z);
  }
  /**
   * 添加标记点
   * 关键点：将 marker 设置为 earthMesh 的子物体，这样旋转就自动对齐了
   */
  public addMarker(lat: number, lon: number, color: string = "#00ff00") {
    if (!this.earthMesh) return;

    const position = this.latLonToVector3(lat, lon);
    const marker = BABYLON.MeshBuilder.CreateSphere(
      "marker",
      { diameter: 0.04 },
      this.scene,
    );

    // 关键：绑定父级，这样地球旋转时，点位会跟着地图走
    marker.parent = this.earthMesh;
    marker.position = position;

    const mat = new BABYLON.StandardMaterial("markerMat", this.scene);
    mat.emissiveColor = BABYLON.Color3.FromHexString(color);
    marker.material = mat;
  }

  public setAllTextures(
    day: string,
    night: string,
    cloud: string,
    normal: string,
    specular: string,
  ) {
    this.material.setTexture(
      "dayTexture",
      new BABYLON.Texture(day, this.scene, false, true),
    );
    this.material.setTexture(
      "nightTexture",
      new BABYLON.Texture(night, this.scene, false, true),
    );
    this.material.setTexture(
      "cloudTexture",
      new BABYLON.Texture(cloud, this.scene, false, true),
    );
    this.material.setTexture(
      "normalTexture",
      new BABYLON.Texture(normal, this.scene, false, true),
    );
    this.material.setTexture(
      "specularTexture",
      new BABYLON.Texture(specular, this.scene, false, true),
    );
  }

  public updateSun(direction: BABYLON.Vector3) {
    this.sunDirection.copyFrom(direction);
    this.material.setVector3("sunDir", this.sunDirection);
    this.material.setVector3(
      "cameraPosition",
      this.scene.activeCamera!.position,
    );
  }

  private startLoop() {
    this.engine.runRenderLoop(() => {
      this.time += 0.01;
      this.material.setFloat("time", this.time);
      this.scene.render();
    });
    window.addEventListener("resize", () => this.engine.resize());
  }
  public drawEquator() {
    const points: BABYLON.Vector3[] = [];

    for (let lon = -180; lon <= 180; lon += 2) {
      points.push(this.latLonToVector3(0, lon, 1.02));
    }

    const line = BABYLON.MeshBuilder.CreateLines(
      "equator",
      { points },
      this.scene,
    );
    line.color = new BABYLON.Color3(1, 0, 0); // 红色
    line.parent = this.earthMesh;
  }
  public drawPrimeMeridian() {
    const points: BABYLON.Vector3[] = [];

    for (let lat = -90; lat <= 90; lat += 2) {
      points.push(this.latLonToVector3(lat, 0, 1.02));
    }

    const line = BABYLON.MeshBuilder.CreateLines(
      "meridian",
      { points },
      this.scene,
    );
    line.color = new BABYLON.Color3(0, 1, 0); // 绿色
    line.parent = this.earthMesh;
  }
  /**
 * 根据日期计算太阳在地球坐标系中的方向向量
 * @param date 默认当前时间
 */
    private calculateSunDirection(date: Date = new Date()): BABYLON.Vector3 {
    // 1. 获取当天是一年中的第几天 (Day of Year)
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

    // 2. 计算赤纬 (Declination) - 太阳直射点的纬度
    // 公式大约为: 23.45 * sin(360/365 * (284 + n))
    const declination = 23.45 * Math.sin((2 * Math.PI / 365) * (dayOfYear + 284));
    const latRad = BABYLON.Tools.ToRadians(declination);

    // 3. 计算当前的经度偏移 (Longitude)
    // UTC 0点时，太阳大约在经度 180° 附近（视具体日期波动，此处用简化模型）
    // 核心：太阳每小时移动 15°
    const utcHours = date.getUTCHours();
    const utcMinutes = date.getUTCMinutes();
    const utcSeconds = date.getUTCSeconds();
    
    const totalSeconds = (utcHours * 3600) + (utcMinutes * 60) + utcSeconds;
    // 计算太阳所在的经度：中午 12:00 UTC 太阳在 0° 附近
    // 这里的 -180 是为了对齐你的纹理 0 度线
    const lon = 180 - (totalSeconds / 86400) * 360; 
    const lonRad = BABYLON.Tools.ToRadians(lon);

    // 4. 转换为 Cartesian 坐标 (Standard Babylon Axis: Y is up)
    // 注意：这里要匹配你 latLonToVector3 的坐标系逻辑
    const x = Math.cos(latRad) * Math.sin(lonRad);
    const y = Math.sin(latRad);
    const z = Math.cos(latRad) * Math.cos(lonRad);

    return new BABYLON.Vector3(x, y, z);
    }
  public drawGrid() {
    // 纬线
    for (let lat = -60; lat <= 60; lat += 30) {
      const points: BABYLON.Vector3[] = [];

      for (let lon = -180; lon <= 180; lon += 2) {
        points.push(this.latLonToVector3(lat, lon, 1.02));
      }

      const line = BABYLON.MeshBuilder.CreateLines(
        "lat",
        { points },
        this.scene,
      );
      line.color = new BABYLON.Color3(0.5, 0.5, 0.5);
      line.parent = this.earthMesh;
    }

    // 经线
    for (let lon = -180; lon <= 180; lon += 30) {
      const points: BABYLON.Vector3[] = [];

      for (let lat = -90; lat <= 90; lat += 2) {
        points.push(this.latLonToVector3(lat, lon, 1.02));
      }

      const line = BABYLON.MeshBuilder.CreateLines(
        "lon",
        { points },
        this.scene,
      );
      line.color = new BABYLON.Color3(0.5, 0.5, 0.5);
      line.parent = this.earthMesh;
    }
  }
  private createLabel(text: string, position: BABYLON.Vector3) {
    const plane = BABYLON.MeshBuilder.CreatePlane(
      "label",
      { size: 0.2 },
      this.scene,
    );

    const texture = new BABYLON.DynamicTexture(
      "labelTex",
      { width: 256, height: 128 },
      this.scene,
    );
    texture.drawText(text, 20, 80, "bold 40px Arial", "white", "transparent");

    const mat = new BABYLON.StandardMaterial("labelMat", this.scene);
    mat.diffuseTexture = texture;
    mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
    mat.backFaceCulling = false;

    plane.material = mat;
    plane.position = position;

    // 让文字始终面向相机
    plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

    plane.parent = this.earthMesh;
  }
  public drawLongitudeLines() {
    for (let lon = -180; lon <= 180; lon += 30) {
      const points: BABYLON.Vector3[] = [];

      for (let lat = -90; lat <= 90; lat += 2) {
        points.push(this.latLonToVector3(lat, lon, 1.02));
      }

      const line = BABYLON.MeshBuilder.CreateLines(
        "lon",
        { points },
        this.scene,
      );
      line.color = new BABYLON.Color3(0, 1, 0);
      line.parent = this.earthMesh;

      // 在赤道标经度
      const pos = this.latLonToVector3(0, lon, 1.1);
      this.createLabel(`Lon ${lon}°`, pos);
    }
  }
  public drawLatitudeLines() {
    for (let lat = -60; lat <= 60; lat += 30) {
      const points: BABYLON.Vector3[] = [];

      for (let lon = -180; lon <= 180; lon += 2) {
        points.push(this.latLonToVector3(lat, lon, 1.02));
      }

      const line = BABYLON.MeshBuilder.CreateLines(
        "lat",
        { points },
        this.scene,
      );
      line.color = new BABYLON.Color3(1, 0, 0);
      line.parent = this.earthMesh;

      // 在 0 经线标纬度
      const pos = this.latLonToVector3(lat, 0, 1.1);
      this.createLabel(`Lat ${lat}°`, pos);
    }
  }
  /**
   * 添加两点间的飞线
   * @param startLat 起点纬度
   * @param startLon 起点经度
   * @param endLat 终点纬度
   * @param endLon 终点经度
   * @param color 颜色
   */
  public addFlightLine(
    startLat: number,
    startLon: number,
    endLat: number,
    endLon: number,
    color: string = "#00ffff",
  ) {
    const startVec = this.latLonToVector3(startLat, startLon, 1.01);
    const endVec = this.latLonToVector3(endLat, endLon, 1.01);

    // 1. 计算中点方向并拉高，作为贝塞尔曲线的控制点
    const middleVec = BABYLON.Vector3.Center(startVec, endVec).normalize();
    // 这里的 1.5 是高度系数，可以根据距离动态调整
    const distance = BABYLON.Vector3.Distance(startVec, endVec);
    const height = 1 + distance * 0.3;
    const controlVec = middleVec.scale(height);

    // 2. 使用贝塞尔曲线生成路径点
    const points = [];
    const steps = 50; // 线条精度
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // 二阶贝塞尔公式: (1-t)^2*P0 + 2t(1-t)*P1 + t^2*P2
      const p = BABYLON.Vector3.Lerp(
        BABYLON.Vector3.Lerp(startVec, controlVec, t),
        BABYLON.Vector3.Lerp(controlVec, endVec, t),
        t,
      );
      points.push(p);
    }

    // 3. 创建线条
    const line = BABYLON.MeshBuilder.CreateLines(
      "flightLine",
      { points: points, updatable: false },
      this.scene,
    );
    line.color = BABYLON.Color3.FromHexString(color);
    line.parent = this.earthMesh;

    // 可选：添加一点发光效果
    // line.renderingGroupId = 1;
  }
  /**
   * 添加带动画发光点的飞线
   */
  public addAnimatedFlightLine(
    startLat: number,
    startLon: number,
    endLat: number,
    endLon: number,
    color: string = "#00ffff",
  ) {
    const startVec = this.latLonToVector3(startLat, startLon, 1.01);
    const endVec = this.latLonToVector3(endLat, endLon, 1.01);

    // 1. 计算控制点（高度）
    const middleVec = BABYLON.Vector3.Center(startVec, endVec).normalize();
    const distance = BABYLON.Vector3.Distance(startVec, endVec);
    const controlVec = middleVec.scale(1 + distance * 0.3);

    // 2. 绘制静态轨迹线
    const points = [];
    for (let i = 0; i <= 50; i++) {
      const t = i / 50;
      points.push(this.getBezierPoint(startVec, controlVec, endVec, t));
    }
    const line = BABYLON.MeshBuilder.CreateLines(
      "line",
      { points },
      this.scene,
    );
    line.color = BABYLON.Color3.FromHexString(color).scale(0.5); // 线条颜色暗一点
    line.parent = this.earthMesh;

    // 3. 创建发光点（小球）
    const dot = BABYLON.MeshBuilder.CreateSphere(
      "dot",
      { diameter: 0.03 },
      this.scene,
    );
    const dotMat = new BABYLON.StandardMaterial("dotMat", this.scene);
    dotMat.emissiveColor = BABYLON.Color3.FromHexString(color);
    dot.material = dotMat;
    dot.parent = this.earthMesh;

    // 4. 动画逻辑
    let progress = 0;
    const speed = 0.005; // 调节速度

    const observer = this.scene.onBeforeRenderObservable.add(() => {
      progress += speed;
      if (progress > 1) progress = 0; // 循环播放

      const pos = this.getBezierPoint(startVec, controlVec, endVec, progress);
      dot.position.copyFrom(pos);
    });

    // 返回以方便后续清理
    return { line, dot, observer };
  }

  /**
   * 二阶贝塞尔曲线公式工具函数
   */
  private getBezierPoint(
    p0: BABYLON.Vector3,
    p1: BABYLON.Vector3,
    p2: BABYLON.Vector3,
    t: number,
  ): BABYLON.Vector3 {
    const invT = 1 - t;
    return p0
      .scale(invT * invT)
      .add(p1.scale(2 * t * invT))
      .add(p2.scale(t * t));
  }
  public dispose() {
    this.engine.dispose();
  }
}

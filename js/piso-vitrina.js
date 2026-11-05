// El piso del visor: un piso oscuro y pulido de sala de exhibición, con el reflejo del
// carro, su sombra de contacto y sin horizonte (se funde con el fondo).
//
// Es lo que más le cambia la cara a la escena por lo que cuesta: el reflejo es la señal
// que dice "este carro está parado ahí", y el borde duro de un disco gris decía lo
// contrario. Se dibuja el carro una vez más visto desde debajo del piso, a media
// resolución y solo cuando se dibuja un cuadro (el visor no dibuja si nada cambia). Así
// el reflejo sigue a las puertas abiertas y a las piezas marcadas sin hacer nada aparte.
import * as THREE from 'three';

const VERTICE = `varying vec3 vP;
void main(){
  vec4 mundo = modelMatrix * vec4(position, 1.0);
  vP = mundo.xyz;
  gl_Position = projectionMatrix * viewMatrix * mundo;
}`;

const FRAGMENTO = `precision highp float;
uniform sampler2D uReflejo;
uniform mat4 uMatriz;
uniform vec3 uFondo;
uniform vec3 uPiso;
uniform vec2 uHuella;
uniform vec2 uTexel;
uniform sampler2D uSombra;
uniform float uLadoSombra;
varying vec3 vP;
void main(){
  vec3 v = normalize(cameraPosition - vP);
  // Mirado de lado, un piso pulido refleja mucho más que mirado desde arriba.
  float canto = pow(1.0 - clamp(v.y, 0.0, 1.0), 3.0);
  vec4 q = uMatriz * vec4(vP, 1.0);
  vec2 uv = q.xy / q.w;
  float planta = length(vP.xz / uHuella);
  // Qué tan lejos de la planta del carro cae este punto: lo que se refleja lejos es lo
  // más alto del carro, y en un piso real eso llega más borroso y más débil.
  float alejado = smoothstep(0.9, 2.3, planta);
  // Lo borroso sale de los mipmaps del reflejo, no de muestras separadas: cuatro
  // muestras muy abiertas dejaban cuatro copias de cada rayo de la llanta.
  float nivel = mix(0.7, 3.4, alejado);
  vec2 t = uTexel * pow(2.0, nivel) * 0.6;
  vec4 r = (textureLod(uReflejo, uv + vec2(t.x, t.y), nivel) + textureLod(uReflejo, uv + vec2(-t.x, t.y), nivel)
    + textureLod(uReflejo, uv + vec2(t.x, -t.y), nivel) + textureLod(uReflejo, uv + vec2(-t.x, -t.y), nivel)) * 0.25;
  float lejos = smoothstep(3.2, 9.0, length(vP.xz));
  vec3 base = mix(uPiso, uFondo, lejos);
  // La sombra, de la huella real del carro: la que se abre, la pegada a la lata y
  // la de donde tocan las llantas, que es la que dice que el carro pisa.
  vec2 uvSombra = vP.xz / uLadoSombra + 0.5;
  vec3 s = (uvSombra.x > 0.0 && uvSombra.x < 1.0 && uvSombra.y > 0.0 && uvSombra.y < 1.0) ? texture2D(uSombra, uvSombra).rgb : vec3(0.0);
  base *= (1.0 - 0.72 * clamp(0.62 * s.r + 0.62 * s.g, 0.0, 1.0)) * (1.0 - 0.85 * s.b);
  float fuerza = mix(0.2, 0.55, canto) * (1.0 - lejos) * mix(1.0, 0.22, alejado);
  // El color del reflejo viene premultiplicado por su alfa al promediar.
  #ifdef SIN_FONDO
    // Sobre lo que haya detrás (la vitrina clara): solo reflejo y sombra.
    float sombra = 1.0 - (1.0 - 0.72 * clamp(0.62 * s.r + 0.62 * s.g, 0.0, 1.0)) * (1.0 - 0.85 * s.b);
    float aR = r.a * fuerza;
    float a = aR + sombra * (1.0 - aR);
    gl_FragColor = vec4(a > 0.001 ? r.rgb * fuerza / a : vec3(0.0), a);
  #else
    vec3 c = base * (1.0 - r.a * fuerza) + r.rgb * fuerza;
    gl_FragColor = vec4(c, 1.0);
  #endif
  #include <colorspace_fragment>
}`;

// La huella de un carro, vista desde arriba: lo que ocupa (borroso dos veces, la
// sombra pegada y la que se abre) y lo que está a menos de 7 cm del piso (las llantas).
// Una imagen chiquita, una sola vez por carro. Se rasterizan los triángulos, no los
// vértices: el carro genérico tiene puertas de dos triángulos.
const LADO_HUELLA = 192;
export function huellaDe(grupo, cubre) {
  const N = LADO_HUELLA;
  const planta = new Uint8Array(N * N);
  const llantas = new Uint8Array(N * N);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const celda = (v) => (v / cubre + 0.5) * N;
  grupo.updateMatrixWorld(true);
  grupo.traverse((m) => {
    if (!m.isMesh || m.userData.decorativo || m.visible === false || !m.geometry.attributes.position) return;
    const P = m.geometry.attributes.position;
    const I = m.geometry.index;
    const triangulos = I ? I.count / 3 : P.count / 3;
    for (let t = 0; t < triangulos; t++) {
      a.fromBufferAttribute(P, I ? I.getX(t * 3) : t * 3).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(P, I ? I.getX(t * 3 + 1) : t * 3 + 1).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(P, I ? I.getX(t * 3 + 2) : t * 3 + 2).applyMatrix4(m.matrixWorld);
      const ax = celda(a.x);
      const az = celda(a.z);
      const bx = celda(b.x);
      const bz = celda(b.z);
      const cx = celda(c.x);
      const cz = celda(c.z);
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
      const x1 = Math.min(N - 1, Math.floor(Math.max(ax, bx, cx)));
      const z0 = Math.max(0, Math.floor(Math.min(az, bz, cz)));
      const z1 = Math.min(N - 1, Math.floor(Math.max(az, bz, cz)));
      const baja = Math.min(a.y, b.y, c.y) < 0.07;
      const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          // Un triángulo más chico que la celda la marca sin más cuenta.
          if (x1 > x0 && z1 > z0 && Math.abs(den) > 1e-9) {
            const l0 = ((bz - cz) * (x + 0.5 - cx) + (cx - bx) * (z + 0.5 - cz)) / den;
            const l1 = ((cz - az) * (x + 0.5 - cx) + (ax - cx) * (z + 0.5 - cz)) / den;
            if (l0 < -0.2 || l1 < -0.2 || l0 + l1 > 1.2) continue;
          }
          planta[z * N + x] = 1;
          if (baja) llantas[z * N + x] = 1;
        }
      }
    }
  });
  const borrosa = (fuente, r) => {
    let actual = Float32Array.from(fuente);
    for (let vuelta = 0; vuelta < 2; vuelta++) {
      const h = new Float32Array(N * N);
      for (let z = 0; z < N; z++) {
        let suma = 0;
        for (let x = -r; x < N; x++) {
          if (x + r < N) suma += actual[z * N + x + r];
          if (x - r - 1 >= 0) suma -= actual[z * N + x - r - 1];
          if (x >= 0) h[z * N + x] = suma / (2 * r + 1);
        }
      }
      const v = new Float32Array(N * N);
      for (let x = 0; x < N; x++) {
        let suma = 0;
        for (let z = -r; z < N; z++) {
          if (z + r < N) suma += h[(z + r) * N + x];
          if (z - r - 1 >= 0) suma -= h[(z - r - 1) * N + x];
          if (z >= 0) v[z * N + x] = suma / (2 * r + 1);
        }
      }
      actual = v;
    }
    return actual;
  };
  const cerca = borrosa(planta, 2);
  const lejos = borrosa(planta, 9);
  const contacto = borrosa(llantas, 1);
  const datos = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    datos[i * 4] = Math.round(255 * cerca[i]);
    datos[i * 4 + 1] = Math.round(255 * lejos[i]);
    datos[i * 4 + 2] = Math.round(255 * Math.min(1, contacto[i] * 1.6));
    datos[i * 4 + 3] = 255;
  }
  return { datos, lado: N, cubre };
}

// `fondo`: el color del fondo de la escena (el piso termina en ese color exacto).
export function crearPisoVitrina(renderizador, escena, { fondo = 0x1a1e24, piso = 0x2c323b, sinFondo = false } = {}) {
  const destino = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uReflejo: { value: destino.texture },
      uMatriz: { value: new THREE.Matrix4() },
      uFondo: { value: new THREE.Color(fondo) },
      uPiso: { value: new THREE.Color(piso) },
      uHuella: { value: new THREE.Vector2(1, 2.3) },
      uTexel: { value: new THREE.Vector2(1 / 4, 1 / 4) },
      uSombra: { value: null },
      uLadoSombra: { value: 1 },
    },
    toneMapped: false,
    transparent: sinFondo,
    depthWrite: !sinFondo,
    defines: sinFondo ? { SIN_FONDO: 1 } : {},
    vertexShader: VERTICE,
    fragmentShader: FRAGMENTO,
  });
  const malla = new THREE.Mesh(new THREE.CircleGeometry(26, 72), material);
  malla.name = 'piso-vitrina';
  malla.rotation.x = -Math.PI / 2;
  malla.raycast = () => {};

  const virtual = new THREE.PerspectiveCamera();
  const sesgo = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  const giro = new THREE.Matrix4();
  const posicion = new THREE.Vector3();
  const mirada = new THREE.Vector3();
  const claro = new THREE.Color();
  // La panza del carro, solo para el reflejo: un escaneo no la tiene (nadie la vio), y desde
  // debajo del piso se veía por dentro la lata del otro costado, a todo color.
  const panza = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x07090c, side: THREE.DoubleSide, toneMapped: false }));
  panza.rotation.x = -Math.PI / 2;
  panza.visible = false;
  panza.raycast = () => {};
  escena.add(panza);
  const texturaSombra = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
  texturaSombra.needsUpdate = true;
  material.uniforms.uSombra.value = texturaSombra;

  return {
    malla,
    // La sombra de este carro. Se llama cuando cambia el carro, no en cada cuadro.
    ponerHuella(grupo, medidas) {
      const h = huellaDe(grupo, Math.max(medidas.largo, medidas.ancho) * 1.7);
      panza.scale.set(medidas.ancho * 0.86, medidas.largo * 0.92, 1);
      panza.position.y = Math.max(0.12, (medidas.alto || 1.4) * 0.11);
      if (texturaSombra.image.width !== h.lado) {
        texturaSombra.dispose();
        texturaSombra.image = { data: h.datos, width: h.lado, height: h.lado };
      } else {
        texturaSombra.image.data = h.datos;
      }
      texturaSombra.magFilter = THREE.LinearFilter;
      texturaSombra.minFilter = THREE.LinearFilter;
      texturaSombra.needsUpdate = true;
      material.uniforms.uLadoSombra.value = h.cubre;
    },
    // A media resolución de la pantalla: es un reflejo borroso, y va en cada cuadro.
    ajustar() {
      const tam = renderizador.getDrawingBufferSize(new THREE.Vector2());
      const ancho = Math.max(2, Math.round(tam.x / 2));
      const alto = Math.max(2, Math.round(tam.y / 2));
      destino.setSize(ancho, alto);
      material.uniforms.uTexel.value.set(1 / ancho, 1 / alto);
    },
    // Dibuja el reflejo para esta cámara; va justo antes de dibujar la escena.
    // `medidas`: largo y ancho del carro, para la sombra.
    actualizar(camara, medidas = null) {
      if (medidas) material.uniforms.uHuella.value.set(medidas.ancho * 0.62, medidas.largo * 0.56);
      camara.updateMatrixWorld();
      posicion.setFromMatrixPosition(camara.matrixWorld);
      giro.extractRotation(camara.matrixWorld);
      mirada.set(0, 0, -1).applyMatrix4(giro).add(posicion);
      // La cámara al otro lado del piso: el plano es y = 0, reflejar es cambiarle el
      // signo a la y.
      virtual.position.set(posicion.x, -posicion.y, posicion.z);
      virtual.up.set(0, 1, 0).applyMatrix4(giro);
      virtual.up.y *= -1;
      virtual.lookAt(mirada.x, -mirada.y, mirada.z);
      virtual.near = camara.near;
      virtual.far = camara.far;
      virtual.updateMatrixWorld();
      virtual.projectionMatrix.copy(camara.projectionMatrix);
      material.uniforms.uMatriz.value.copy(sesgo).multiply(virtual.projectionMatrix).multiply(virtual.matrixWorldInverse);

      const fondoAntes = escena.background;
      const anterior = renderizador.getRenderTarget();
      renderizador.getClearColor(claro);
      const alfaAntes = renderizador.getClearAlpha();
      malla.visible = false;
      panza.visible = true;
      escena.background = null;
      renderizador.setRenderTarget(destino);
      renderizador.setClearColor(0x000000, 0);
      renderizador.clear();
      renderizador.render(escena, virtual);
      renderizador.setRenderTarget(anterior);
      renderizador.setClearColor(claro, alfaAntes);
      escena.background = fondoAntes;
      panza.visible = false;
      malla.visible = true;
    },
    liberar() {
      destino.dispose();
      panza.geometry.dispose();
      panza.material.dispose();
      texturaSombra.dispose();
      material.dispose();
      malla.geometry.dispose();
    },
  };
}

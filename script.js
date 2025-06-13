/* =================================================================================
 * SCRIPT UNIFICADO: LÓGICA DE CÁMARA + AUTENTICACIÓN COGNITO + ENVÍO A API AWS
 * ================================================================================= */

document.addEventListener("DOMContentLoaded", async () => {
    // --- CONFIGURACIÓN DE AWS (del script de integración) ---
    const COGNITO_DOMAIN = "https://us-east-2hzvyeyito.auth.us-east-2.amazoncognito.com";
    const CLIENT_ID = "6b39hqau6fq2j29u05n79m5d4k";
    const REDIRECT_URI = "https://jssgr.github.io/app-camara/";
    const TOKEN_ENDPOINT = `${COGNITO_DOMAIN}/oauth2/token`;
    const API_URL = "https://y1932yqsn7.execute-api.us-east-2.amazonaws.com/prod/procesarImagenIdentificacion";

    /**
     * Maneja el flujo de autenticación con Cognito.
     * Redirige para iniciar sesión si es necesario o intercambia el código por un token.
     */
    function autenticarConCognito() {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const jwt = sessionStorage.getItem("jwtToken");

        // Si no hay token ni código, debe iniciar sesión
        if (!jwt && !code) {
            const loginUrl = `${COGNITO_DOMAIN}/login?client_id=${CLIENT_ID}&response_type=code&scope=email+openid+phone&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
            window.location.href = loginUrl;
            return Promise.resolve(false); // Retorna una promesa resuelta en falso
        }

        // Si hay un código en la URL, lo intercambia por un token
        if (code) {
            const body = new URLSearchParams({
                grant_type: "authorization_code",
                client_id: CLIENT_ID,
                code,
                redirect_uri: REDIRECT_URI
            });

            return fetch(TOKEN_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body
            })
            .then(res => {
                if (!res.ok) throw new Error('Falló la solicitud de token');
                return res.json();
            })
            .then(data => {
                const jwtToken = data.id_token;
                if (jwtToken) {
                    sessionStorage.setItem("jwtToken", jwtToken);
                    window.history.replaceState({}, document.title, REDIRECT_URI); // Limpia la URL
                    return true;
                } else {
                    alert("Error al obtener token de acceso de Cognito.");
                    return false;
                }
            })
            .catch((err) => {
                console.error("Error en autenticación:", err);
                alert("Fallo al autenticar con Cognito.");
                return false;
            });
        }
        
        // Si ya hay un JWT en la sesión, está listo
        return Promise.resolve(true);
    }

    /**
     * Convierte el contenido de un canvas a Base64 y lo envía a la API.
     */
    async function enviarImagen(canvas, nombre, jwtToken) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(async (blob) => {
                const reader = new FileReader();
                reader.onloadend = async function () {
                    const base64Data = reader.result.split(',')[1];
                    try {
                        const res = await fetch(API_URL, {
                            method: "POST",
                            headers: {
                                "Authorization": jwtToken,
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                image_name: nombre,
                                image_data: base64Data
                            })
                        });
                        if (!res.ok) {
                            const errorText = await res.text();
                            throw new Error(`Error del servidor: ${res.status} ${errorText}`);
                        }
                        const responseData = await res.json();
                        console.log(`Respuesta de API para ${nombre}:`, responseData);
                        resolve(responseData);
                    } catch (err) {
                        console.error(`Error al enviar ${nombre}:`, err);
                        reject(err);
                    }
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            }, "image/png");
        });
    }


    /**
     * Función principal que inicializa toda la lógica de la cámara y la UI.
     * Esta función solo se ejecuta si la autenticación con Cognito es exitosa.
     */
    function iniciarAplicacion() {
        // --- Constantes de configuración (del script original) ---
        const UMBRAL_SUMA_DE_BRILLO = 660; 
        const UMBRAL_SATURACION = 30;
        const AREA_REFLEJO_THRESHOLD = 0.2;

        // --- Elementos del DOM (del script original) ---
        const primaryActionBtn = document.getElementById('primary-action-btn');
        const secondaryActionBtn = document.getElementById('secondary-action-btn');
        const cameraSelect = document.getElementById('cameraSelect');
        const docType = document.getElementById('docType');
        const messageDiv = document.getElementById('message');
        const rotateOverlay = document.getElementById('rotate-device-overlay');
        const mainControls = document.getElementById('main-controls');
        const finalControls = document.getElementById('final-controls');
        const newIdBtn = document.getElementById('new-id-btn');
        const logoutBtn = document.getElementById('logout-btn'); // Botón de salir
        const setupControls = document.getElementById('setup-controls');
        const captureUiWrapper = document.getElementById('capture-ui-wrapper');
        const previewsContainer = document.getElementById('previews-container');
        const canvasFront = document.getElementById('canvas-front');
        const canvasBack = document.getElementById('canvas-back');
        const video = document.getElementById('video');
        const overlay = document.getElementById('overlay-box');
        
        // --- Máquina de Estados (del script original) ---
        const AppState = {
            INIT: 'INIT',
            AWAITING_FRONT: 'AWAITING_FRONT',
            FRONT_CAPTURED: 'FRONT_CAPTURED',
            AWAITING_BACK: 'AWAITING_BACK',
            BACK_CAPTURED: 'BACK_CAPTURED',
            ALL_CAPTURED: 'ALL_CAPTURED',
            SENDING: 'SENDING', // Estado nuevo para el envío
            PROCESS_COMPLETE: 'PROCESS_COMPLETE'
        };
        let currentState = AppState.INIT;
        let currentStream = null;
        let systemReadyTimeout = null;

        // --- Lógica de UI (actualizada para nuevos estados) ---
        function updateUIForState() {
            [captureUiWrapper, previewsContainer, mainControls, finalControls, secondaryActionBtn, setupControls].forEach(el => el.classList.add('hidden'));
            showMessage("");
            primaryActionBtn.disabled = false;
            secondaryActionBtn.disabled = false;

            switch (currentState) {
                case AppState.INIT:
                    setupControls.classList.remove('hidden');
                    mainControls.classList.remove('hidden');
                    primaryActionBtn.textContent = 'Iniciar Captura';
                    showMessage("Seleccione el tipo de documento.");
                    break;
                
                case AppState.AWAITING_FRONT:
                case AppState.AWAITING_BACK:
                    mainControls.classList.remove('hidden');
                    captureUiWrapper.classList.remove('hidden');
                    if(canvasFront.width > 0) previewsContainer.classList.remove('hidden');
                    primaryActionBtn.textContent = currentState === AppState.AWAITING_FRONT ? 'Capturar Frente' : 'Capturar Reverso';
                    resetSystemState();
                    break;

                case AppState.FRONT_CAPTURED:
                case AppState.BACK_CAPTURED:
                    mainControls.classList.remove('hidden');
                    previewsContainer.classList.remove('hidden');
                    secondaryActionBtn.classList.remove('hidden');
                    primaryActionBtn.textContent = currentState === AppState.FRONT_CAPTURED ? 'Aceptar Frente' : 'Aceptar Reverso';
                    secondaryActionBtn.textContent = currentState === AppState.FRONT_CAPTURED ? 'Reintentar Frente' : 'Reintentar Reverso';
                    break;
                    
                case AppState.ALL_CAPTURED:
                    mainControls.classList.remove('hidden');
                    previewsContainer.classList.remove('hidden');
                    primaryActionBtn.textContent = 'Enviar a BDR';
                    showMessage("✅ Capturas completadas. Listo para enviar.");
                    break;

                case AppState.SENDING:
                    mainControls.classList.remove('hidden');
                    previewsContainer.classList.remove('hidden');
                    primaryActionBtn.textContent = 'Enviando...';
                    primaryActionBtn.disabled = true;
                    showMessage("⏳ Enviando capturas, por favor espere.");
                    break;

                case AppState.PROCESS_COMPLETE:
                    finalControls.classList.remove('hidden');
                    previewsContainer.classList.remove('hidden');
                    showMessage("🚀 Proceso finalizado con éxito. Las imágenes fueron enviadas.");
                    break;
            }
            checkOrientation();
        }

        // --- ANALIZAR REFLEJOS y CAPTURE IMAGE (sin cambios) ---
        function analizarReflejos(canvas) {
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            const marginX = canvas.width * 0.10;
            const marginY = canvas.height * 0.10;
            const analysisWidth = canvas.width - (2 * marginX);
            const analysisHeight = canvas.height - (2 * marginY);
            const imageData = ctx.getImageData(marginX, marginY, analysisWidth, analysisHeight);
            const data = imageData.data;
            let glarePixels = 0;
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i], g = data[i+1], b = data[i+2];
                if ((r + g + b) > UMBRAL_SUMA_DE_BRILLO) {
                    const max = Math.max(r, g, b), min = Math.min(r, g, b);
                    if ((max - min) < UMBRAL_SATURACION) glarePixels++;
                }
            }
            const totalPixelsAnalizados = analysisWidth * analysisHeight;
            const percentage = (glarePixels / totalPixelsAnalizados) * 100;
            return percentage > AREA_REFLEJO_THRESHOLD;
        }

        function captureImage(side) {
            if (video.readyState < video.HAVE_METADATA) return;
            const targetCanvas = (side === 'front') ? canvasFront : canvasBack;
            const ctx = targetCanvas.getContext('2d');
            const videoRect = video.getBoundingClientRect();
            const overlayRect = overlay.getBoundingClientRect();
            const scaleX = video.videoWidth / videoRect.width;
            const scaleY = video.videoHeight / videoRect.height;
            const cropX = (overlayRect.left - videoRect.left) * scaleX;
            const cropY = (overlayRect.top - videoRect.top) * scaleY;
            const cropWidth = overlayRect.width * scaleX;
            const cropHeight = overlayRect.height * scaleY;
            targetCanvas.width = cropWidth;
            targetCanvas.height = cropHeight;
            ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
            clearTimeout(systemReadyTimeout);
            
            currentState = (side === 'front') ? AppState.FRONT_CAPTURED : AppState.BACK_CAPTURED;
            updateUIForState(); 

            if (analizarReflejos(targetCanvas)) {
                showMessage(`⚠️ Posible reflejo detectado. Intente con una luz más suave o un ángulo diferente.`);
            } else {
                showMessage(`Verifique la calidad de la captura.`);
            }
        }

        // --- FUNCIONES DE SOPORTE (sin cambios del original) ---
        const isLandscape = () => window.innerWidth > window.innerHeight;
        
        function resetSystemState() {
            clearTimeout(systemReadyTimeout);
            overlay.classList.remove('is-ready', 'is-detecting');
            primaryActionBtn.disabled = true;
            const message = currentState === AppState.AWAITING_FRONT ? "🎥 Centre el FRENTE..." : "🔄 Centre el REVERSO...";
            showMessage(message);
            // Pequeño delay para asegurar que el usuario vea el mensaje antes de que se active el cuadro
            setTimeout(() => {
                overlay.classList.add('is-detecting');
                systemReadyTimeout = setTimeout(() => {
                    overlay.classList.remove('is-detecting');
                    overlay.classList.add('is-ready');
                    updateButtonState();
                }, 2500);
            }, 100);
        }
        
        function updateButtonState() {
            const isCaptureState = currentState === AppState.AWAITING_FRONT || currentState === AppState.AWAITING_BACK;
            if (isLandscape() && isCaptureState && overlay.classList.contains('is-ready')) {
                primaryActionBtn.disabled = false;
            } else if (isCaptureState) {
                primaryActionBtn.disabled = true;
            }
        }

        function checkOrientation() {
            rotateOverlay.classList.toggle('hidden', isLandscape());
            updateButtonState();
        }

        async function getCameras() {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            if (videoDevices.length === 0) throw new Error("No se encontraron cámaras.");
            
            cameraSelect.innerHTML = videoDevices.map((d, i) => `<option value="${d.deviceId}">${d.label || `Cámara ${i+1}`}</option>`).join('');
            const backCamera = videoDevices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('trasera'));
            if (backCamera) cameraSelect.value = backCamera.deviceId;
        }

        async function startCamera() {
            if (currentStream) currentStream.getTracks().forEach(track => track.stop());
            const constraints = { video: {
                width: { ideal: 1920 }, height: { ideal: 1080 },
                deviceId: cameraSelect.value ? { exact: cameraSelect.value } : undefined,
                facingMode: cameraSelect.value ? undefined : { ideal: 'environment' }
            }};
            try {
                currentStream = await navigator.mediaDevices.getUserMedia(constraints);
                video.srcObject = currentStream;
                await new Promise(resolve => video.onloadedmetadata = resolve);
                if (!cameraSelect.value) await getCameras();
                currentState = AppState.AWAITING_FRONT;
                updateUIForState();
            } catch (err) {
                console.error("Error al iniciar la cámara:", err);
                showMessage("No se pudo iniciar la cámara. Revisa los permisos y asegúrate de que no esté en uso.");
                currentState = AppState.INIT;
                updateUIForState();
            }
        }

        function showMessage(text) { messageDiv.textContent = text || ""; }

        // --- MANEJADORES DE EVENTOS (EVENT HANDLERS) ---
        
        // MODIFICADO: El botón principal ahora maneja el envío
        primaryActionBtn.addEventListener('click', async () => {
            switch (currentState) {
                case AppState.INIT:
                    showMessage("Tu navegador te pedirá permiso para usar la cámara. Por favor, selecciona 'Permitir'.");
                    setTimeout(startCamera, 100);
                    break;
                case AppState.AWAITING_FRONT: captureImage('front'); break;
                case AppState.FRONT_CAPTURED: currentState = AppState.AWAITING_BACK; updateUIForState(); break;
                case AppState.AWAITING_BACK: captureImage('back'); break;
                case AppState.BACK_CAPTURED: currentState = AppState.ALL_CAPTURED; updateUIForState(); break;
                case AppState.ALL_CAPTURED:
                    const jwtToken = sessionStorage.getItem("jwtToken");
                    if (!jwtToken) {
                        alert("Error de autenticación. No se encontró el token de sesión. Por favor, recargue la página.");
                        return;
                    }
                    
                    currentState = AppState.SENDING;
                    updateUIForState();

                    try {
                        const id = Math.random().toString(36).substring(2, 9);
                        const frontPromise = enviarImagen(canvasFront, `ID_${docType.value}_${id}_FRENTE.png`, jwtToken);
                        const backPromise = enviarImagen(canvasBack, `ID_${docType.value}_${id}_REVERSO.png`, jwtToken);
                        
                        await Promise.all([frontPromise, backPromise]);
                        
                        currentState = AppState.PROCESS_COMPLETE;
                        updateUIForState();

                    } catch (error) {
                        console.error("Fallo el envío de una o ambas imágenes:", error);
                        showMessage(`❌ Error al enviar. ${error.message}. Por favor, inténtelo de nuevo.`);
                        currentState = AppState.ALL_CAPTURED; // Vuelve al estado anterior para reintentar
                        updateUIForState();
                    }
                    break;
            }
        });

        secondaryActionBtn.addEventListener('click', () => {
            currentState = (currentState === AppState.FRONT_CAPTURED) ? AppState.AWAITING_FRONT : AppState.AWAITING_BACK;
            updateUIForState();
        });

        newIdBtn.addEventListener('click', () => {
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
                currentStream = null;
            }
            [canvasFront, canvasBack].forEach(c => c.getContext('2d').clearRect(0, 0, c.width, c.height));
            currentState = AppState.INIT;
            updateUIForState();
        });

        // NUEVO: Manejador para el botón de Salir
        logoutBtn.addEventListener('click', () => {
            sessionStorage.removeItem('jwtToken');
            const logoutUrl = `${COGNITO_DOMAIN}/logout?client_id=${CLIENT_ID}&logout_uri=${encodeURIComponent(REDIRECT_URI)}`;
            window.location.href = logoutUrl;
        });

        cameraSelect.addEventListener('change', startCamera);
        docType.addEventListener('change', () => {
            const doc = docType.value;
            overlay.className = 'overlay-box'; // Reset classes
            if (doc === 'ine' || doc === 'license' || doc === 'old_citizen') {
                overlay.classList.add('overlay-ine');
            } else if (doc === 'passport') {
                overlay.classList.add('overlay-passport');
            }
        });
        window.addEventListener('resize', checkOrientation);

        // Punto de entrada de la lógica de la cámara
        if (!navigator.mediaDevices?.getUserMedia) {
            showMessage("Tu navegador no soporta la API de cámara. Usa un navegador moderno.");
            primaryActionBtn.disabled = true;
            docType.disabled = true;
        } else {
            updateUIForState();
        }
    }

    // ======================================================
    // PUNTO DE ENTRADA PRINCIPAL DE LA APLICACIÓN
    // ======================================================
    const estaAutenticado = await autenticarConCognito();
    if (estaAutenticado) {
        // Si el usuario está autenticado, se inicia la app de la cámara
        iniciarAplicacion();
    } else {
        // Si no está autenticado, la app no se carga. 
        // La función autenticarConCognito ya se encargó de redirigir al login.
        // Se puede mostrar un mensaje por si algo falla y no redirige.
        const messageDiv = document.getElementById('message');
        if (messageDiv) {
            messageDiv.textContent = "Redirigiendo al portal de autenticación...";
        }
    }
});

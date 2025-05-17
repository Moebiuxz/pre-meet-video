# Validador de Conexión, Audio y Video

Un componente web responsivo para verificar la conexión a internet, cámara y micrófono antes de iniciar una videollamada. Similar al validador que utiliza Google Meet.

## Características

- Comprobación de conexión a internet
- Verificación de acceso y funcionamiento de la cámara web
- Verificación de acceso y funcionamiento del micrófono con medidor visual
- Interfaz responsiva que se adapta a dispositivos móviles y de escritorio
- Compatible con múltiples navegadores (Chrome, Firefox, Safari, Edge)
- Fácil integración en aplicaciones existentes

## Requisitos

- Navegador moderno que soporte la API MediaDevices
- Conexión a internet (para la prueba de conectividad)
- Cámara web y micrófono

## Estructura del Proyecto

```
pre-meet-video/
├── index.html          # Archivo HTML principal
├── css/
│   └── styles.css      # Estilos CSS
└── js/
    └── app.js          # Lógica JavaScript
```

## Cómo usar

1. Clona o descarga este repositorio
2. Abre el archivo `index.html` en tu navegador
3. Permite el acceso a la cámara y micrófono cuando se solicite
4. Revisa los resultados de las pruebas

## Integración en Laravel

Para integrar este validador en un sistema Laravel, sigue estos pasos:

### 1. Copia los archivos estáticos

Copia los archivos al directorio público de Laravel:

```bash
cp -r css/ js/ /ruta/a/tu/proyecto/laravel/public/
```

### 2. Crea una ruta y vista

Crea una nueva ruta en `routes/web.php`:

```php
Route::get('/validador', function () {
    return view('validador.index');
});
```

### 3. Crea una vista en Laravel

Crea un nuevo archivo de vista en `resources/views/validador/index.blade.php`:

```html
@extends('layouts.app')

@section('styles')
    <link rel="stylesheet" href="{{ asset('css/styles.css') }}">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
@endsection

@section('content')
<div class="container">
    <h1>Comprobación de Sistema</h1>
    
    <div class="card">
        <div class="test-item" id="connection-test">
            <div class="icon">
                <i class="fas fa-wifi"></i>
            </div>
            <div class="info">
                <h2>Conexión a Internet</h2>
                <p id="connection-status">Comprobando...</p>
            </div>
            <div class="status-icon">
                <i class="fas fa-spinner fa-spin"></i>
            </div>
        </div>
        
        <div class="test-item" id="camera-test">
            <div class="icon">
                <i class="fas fa-video"></i>
            </div>
            <div class="info">
                <h2>Cámara</h2>
                <p id="camera-status">Comprobando...</p>
            </div>
            <div class="status-icon">
                <i class="fas fa-spinner fa-spin"></i>
            </div>
        </div>
        
        <div class="test-item" id="microphone-test">
            <div class="icon">
                <i class="fas fa-microphone"></i>
            </div>
            <div class="info">
                <h2>Micrófono</h2>
                <p id="mic-status">Comprobando...</p>
            </div>
            <div class="status-icon">
                <i class="fas fa-spinner fa-spin"></i>
            </div>
        </div>
    </div>
    
    <div class="preview-container">
        <div class="video-container">
            <video id="video-preview" autoplay playsinline muted></video>
            <div class="no-video">
                <i class="fas fa-video-slash"></i>
                <p>No se detecta video</p>
            </div>
        </div>
        <div class="audio-meter-container">
            <div class="audio-label">Nivel de Audio</div>
            <div class="audio-meter">
                <div class="audio-meter-fill" id="audio-meter-fill"></div>
            </div>
        </div>
    </div>
    
    <div class="actions">
        <button id="retry-button">Reintentar</button>
        <a href="{{ route('tu.ruta.de.videollamada') }}" class="btn btn-primary" id="continue-button" style="display:none;">Continuar</a>
    </div>
</div>
@endsection

@section('scripts')
    <script src="{{ asset('js/app.js') }}"></script>
    <script>
        // Código adicional específico para Laravel
        document.addEventListener('DOMContentLoaded', () => {
            const continueButton = document.getElementById('continue-button');
            
            // Verificar periódicamente si todos los tests pasaron
            setInterval(() => {
                const allTestsPassed = window.testState && 
                    (window.testState.connection === 'success' || window.testState.connection === 'warning') && 
                    window.testState.camera === 'success' && 
                    window.testState.microphone === 'success';
                
                continueButton.style.display = allTestsPassed ? 'inline-block' : 'none';
            }, 1000);
        });
    </script>
@endsection
```

### 4. Modifica el archivo JavaScript

Actualiza el archivo `public/js/app.js` para exponer el estado de las pruebas globalmente:

```javascript
// Añade esta línea después de definir testState
window.testState = testState;
```

### 5. Integra con tu Sistema de Videollamadas

Asegúrate de actualizar la ruta en el enlace "Continuar" para que apunte a tu sistema de videollamadas:

```html
<a href="{{ route('tu.ruta.de.videollamada') }}" class="btn btn-primary" id="continue-button" style="display:none;">Continuar</a>
```

## Personalización

Puedes personalizar los estilos y la lógica según tus necesidades modificando los archivos CSS y JavaScript.

## Compatibilidad de Navegadores

- Chrome 53+
- Firefox 42+
- Safari 11+
- Edge 12+
- Opera 40+

## Licencia

MIT 
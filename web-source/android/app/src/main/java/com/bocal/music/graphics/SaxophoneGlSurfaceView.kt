package com.bocal.music.graphics

import android.content.Context
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.opengl.Matrix
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import com.bocal.music.data.SaxophoneData
import java.nio.ByteBuffer
import java.nio.ByteOrder
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.min

enum class ModelStatus { LOADING, READY, ERROR }

class SaxophoneGlSurfaceView(
    context: Context,
    onStatus: (ModelStatus) -> Unit,
) : GLSurfaceView(context) {
    private val saxRenderer = SaxRenderer(context, onStatus)
    private var previousX = 0f
    private var previousY = 0f
    private var dragging = false
    private val scaleDetector = ScaleGestureDetector(context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
        override fun onScale(detector: ScaleGestureDetector): Boolean {
            saxRenderer.zoomBy(detector.scaleFactor)
            return true
        }
    })

    init {
        setEGLContextClientVersion(2)
        setEGLConfigChooser(8, 8, 8, 8, 24, 0)
        preserveEGLContextOnPause = true
        setRenderer(saxRenderer)
        renderMode = RENDERMODE_CONTINUOUSLY
        contentDescription = "Interactive bronze alto saxophone. Drag to orbit and pinch to zoom."
    }

    fun setActiveKeys(ids: Set<String>) {
        saxRenderer.activeKeyIds = ids
    }

    fun setShowAvailable(show: Boolean) {
        saxRenderer.showAvailable = show
    }

    fun resetCamera() {
        saxRenderer.resetCamera()
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        scaleDetector.onTouchEvent(event)
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                previousX = event.x
                previousY = event.y
                dragging = true
                parent?.requestDisallowInterceptTouchEvent(true)
            }
            MotionEvent.ACTION_MOVE -> if (dragging && !scaleDetector.isInProgress && event.pointerCount == 1) {
                val dx = event.x - previousX
                val dy = event.y - previousY
                saxRenderer.orbitBy(dx * 0.32f, dy * 0.24f)
                previousX = event.x
                previousY = event.y
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                dragging = false
                parent?.requestDisallowInterceptTouchEvent(false)
            }
        }
        return true
    }
}

private class SaxRenderer(
    private val context: Context,
    private val onStatus: (ModelStatus) -> Unit,
) : GLSurfaceView.Renderer {
    private val mainHandler = Handler(Looper.getMainLooper())
    private var model: BronzeModel? = null
    private var modelProgram = 0
    private var markerProgram = 0
    private var width = 1
    private var height = 1
    private val projection = FloatArray(16)
    private var yaw = 0f
    private var pitch = 0f
    private var cameraDistance = 12.6f
    private val allKeysBuffer = ByteBuffer.allocateDirect(SaxophoneData.keys.size * 3 * Float.SIZE_BYTES)
        .order(ByteOrder.nativeOrder())
        .asFloatBuffer()
        .also { buffer ->
            SaxophoneData.keys.forEach { buffer.put(it.x).put(it.y).put(it.z) }
            buffer.position(0)
        }
    private val activeKeysBuffer = ByteBuffer.allocateDirect(SaxophoneData.keys.size * 3 * Float.SIZE_BYTES)
        .order(ByteOrder.nativeOrder())
        .asFloatBuffer()

    @Volatile var activeKeyIds: Set<String> = setOf("lh1", "lh2")
    @Volatile var showAvailable: Boolean = false

    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        GLES20.glClearColor(0.035f, 0.039f, 0.047f, 1f)
        GLES20.glEnable(GLES20.GL_DEPTH_TEST)
        GLES20.glDepthFunc(GLES20.GL_LEQUAL)
        modelProgram = linkProgram(MODEL_VERTEX_SHADER, MODEL_FRAGMENT_SHADER)
        markerProgram = linkProgram(MARKER_VERTEX_SHADER, MARKER_FRAGMENT_SHADER)
        publish(ModelStatus.LOADING)
        model = runCatching { GlbModelLoader.load(context.assets, "models/saxophone-alto.glb") }
            .onFailure { publish(ModelStatus.ERROR) }
            .getOrNull()
        if (model != null) publish(ModelStatus.READY)
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        this.width = width.coerceAtLeast(1)
        this.height = height.coerceAtLeast(1)
        GLES20.glViewport(0, 0, this.width, this.height)
        Matrix.perspectiveM(projection, 0, 31f, this.width.toFloat() / this.height, 0.1f, 100f)
    }

    override fun onDrawFrame(gl: GL10?) {
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)
        val currentModel = model ?: return

        val view = FloatArray(16)
        Matrix.setLookAtM(view, 0, 0f, 0f, cameraDistance, 0f, 0f, 0f, 0f, 1f, 0f)
        val viewProjection = FloatArray(16)
        Matrix.multiplyMM(viewProjection, 0, projection, 0, view, 0)

        val yawMatrix = FloatArray(16)
        val pitchMatrix = FloatArray(16)
        val rotation = FloatArray(16)
        Matrix.setRotateM(yawMatrix, 0, yaw, 0f, 1f, 0f)
        Matrix.setRotateM(pitchMatrix, 0, pitch, 1f, 0f, 0f)
        Matrix.multiplyMM(rotation, 0, pitchMatrix, 0, yawMatrix, 0)

        val normalized = FloatArray(16).also { Matrix.setIdentityM(it, 0) }
        val normalizedScale = 7.1f / currentModel.height
        Matrix.translateM(normalized, 0, 0f, 0.05f, 0f)
        Matrix.scaleM(normalized, 0, normalizedScale, normalizedScale, normalizedScale)
        Matrix.translateM(normalized, 0, -currentModel.centerX, -currentModel.centerY, -currentModel.centerZ)
        val modelMatrix = FloatArray(16)
        Matrix.multiplyMM(modelMatrix, 0, rotation, 0, normalized, 0)
        val mvp = FloatArray(16)
        Matrix.multiplyMM(mvp, 0, viewProjection, 0, modelMatrix, 0)
        drawModel(currentModel, modelMatrix, mvp)

        val markerMvp = FloatArray(16)
        Matrix.multiplyMM(markerMvp, 0, viewProjection, 0, rotation, 0)
        drawMarkers(markerMvp)
    }

    fun orbitBy(dx: Float, dy: Float) {
        yaw = (yaw + dx) % 360f
        pitch = (pitch + dy).coerceIn(-32f, 32f)
    }

    fun zoomBy(scaleFactor: Float) {
        cameraDistance = (cameraDistance / scaleFactor).coerceIn(9.4f, 17.5f)
    }

    fun resetCamera() {
        yaw = 0f
        pitch = 0f
        cameraDistance = 12.6f
    }

    private fun drawModel(model: BronzeModel, modelMatrix: FloatArray, mvp: FloatArray) {
        GLES20.glUseProgram(modelProgram)
        val positionHandle = GLES20.glGetAttribLocation(modelProgram, "aPosition")
        val normalHandle = GLES20.glGetAttribLocation(modelProgram, "aNormal")
        GLES20.glUniformMatrix4fv(GLES20.glGetUniformLocation(modelProgram, "uModel"), 1, false, modelMatrix, 0)
        GLES20.glUniformMatrix4fv(GLES20.glGetUniformLocation(modelProgram, "uMvp"), 1, false, mvp, 0)
        GLES20.glEnableVertexAttribArray(positionHandle)
        GLES20.glEnableVertexAttribArray(normalHandle)
        model.primitives.forEach { primitive ->
            val color = when (primitive.materialRole) {
                MaterialRole.BODY -> floatArrayOf(0.66f, 0.40f, 0.14f, 1f)
                MaterialRole.KEYWORK -> floatArrayOf(0.91f, 0.66f, 0.24f, 1f)
                MaterialRole.CORK -> floatArrayOf(0.24f, 0.12f, 0.055f, 1f)
            }
            GLES20.glUniform4fv(GLES20.glGetUniformLocation(modelProgram, "uColor"), 1, color, 0)
            primitive.vertices.position(0)
            GLES20.glVertexAttribPointer(positionHandle, 3, GLES20.GL_FLOAT, false, 6 * Float.SIZE_BYTES, primitive.vertices)
            primitive.vertices.position(3)
            GLES20.glVertexAttribPointer(normalHandle, 3, GLES20.GL_FLOAT, false, 6 * Float.SIZE_BYTES, primitive.vertices)
            primitive.indices.position(0)
            GLES20.glDrawElements(GLES20.GL_TRIANGLES, primitive.indexCount, GLES20.GL_UNSIGNED_SHORT, primitive.indices)
        }
        GLES20.glDisableVertexAttribArray(positionHandle)
        GLES20.glDisableVertexAttribArray(normalHandle)
    }

    private fun drawMarkers(mvp: FloatArray) {
        GLES20.glDisable(GLES20.GL_DEPTH_TEST)
        GLES20.glEnable(GLES20.GL_BLEND)
        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE)
        GLES20.glUseProgram(markerProgram)
        GLES20.glUniformMatrix4fv(GLES20.glGetUniformLocation(markerProgram, "uMvp"), 1, false, mvp, 0)
        val positionHandle = GLES20.glGetAttribLocation(markerProgram, "aPosition")
        GLES20.glEnableVertexAttribArray(positionHandle)
        val baseSize = min(width, height).toFloat().coerceIn(320f, 1_200f)

        if (showAvailable) {
            allKeysBuffer.position(0)
            GLES20.glUniform1f(GLES20.glGetUniformLocation(markerProgram, "uPointSize"), (baseSize / 22f).coerceIn(18f, 42f))
            GLES20.glUniform1f(GLES20.glGetUniformLocation(markerProgram, "uMode"), 2f)
            GLES20.glUniform4f(GLES20.glGetUniformLocation(markerProgram, "uColor"), 0.91f, 0.66f, 0.24f, 0.42f)
            GLES20.glVertexAttribPointer(positionHandle, 3, GLES20.GL_FLOAT, false, 0, allKeysBuffer)
            GLES20.glDrawArrays(GLES20.GL_POINTS, 0, SaxophoneData.keys.size)
        }

        val active = SaxophoneData.keys.filter { it.id in activeKeyIds }
        if (active.isNotEmpty()) {
            activeKeysBuffer.clear()
            active.forEach { activeKeysBuffer.put(it.x).put(it.y).put(it.z) }
            activeKeysBuffer.position(0)
            val pulse = 1f + kotlin.math.sin(System.nanoTime() / 260_000_000.0).toFloat() * 0.08f
            GLES20.glVertexAttribPointer(positionHandle, 3, GLES20.GL_FLOAT, false, 0, activeKeysBuffer)
            GLES20.glUniform1f(GLES20.glGetUniformLocation(markerProgram, "uPointSize"), (baseSize / 11f * pulse).coerceIn(38f, 82f))
            GLES20.glUniform1f(GLES20.glGetUniformLocation(markerProgram, "uMode"), 0f)
            GLES20.glUniform4f(GLES20.glGetUniformLocation(markerProgram, "uColor"), 0.03f, 1f, 0.84f, 0.46f)
            GLES20.glDrawArrays(GLES20.GL_POINTS, 0, active.size)
            activeKeysBuffer.position(0)
            GLES20.glUniform1f(GLES20.glGetUniformLocation(markerProgram, "uPointSize"), (baseSize / 24f).coerceIn(16f, 36f))
            GLES20.glUniform1f(GLES20.glGetUniformLocation(markerProgram, "uMode"), 1f)
            GLES20.glUniform4f(GLES20.glGetUniformLocation(markerProgram, "uColor"), 0.03f, 1f, 0.84f, 0.98f)
            GLES20.glVertexAttribPointer(positionHandle, 3, GLES20.GL_FLOAT, false, 0, activeKeysBuffer)
            GLES20.glDrawArrays(GLES20.GL_POINTS, 0, active.size)
        }
        GLES20.glDisableVertexAttribArray(positionHandle)
        GLES20.glDisable(GLES20.GL_BLEND)
        GLES20.glEnable(GLES20.GL_DEPTH_TEST)
    }

    private fun publish(status: ModelStatus) {
        mainHandler.post { onStatus(status) }
    }

    private fun linkProgram(vertexSource: String, fragmentSource: String): Int {
        fun compile(type: Int, source: String): Int {
            val shader = GLES20.glCreateShader(type)
            GLES20.glShaderSource(shader, source)
            GLES20.glCompileShader(shader)
            val compiled = IntArray(1)
            GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, compiled, 0)
            require(compiled[0] != 0) { GLES20.glGetShaderInfoLog(shader) }
            return shader
        }
        val vertex = compile(GLES20.GL_VERTEX_SHADER, vertexSource)
        val fragment = compile(GLES20.GL_FRAGMENT_SHADER, fragmentSource)
        val program = GLES20.glCreateProgram()
        GLES20.glAttachShader(program, vertex)
        GLES20.glAttachShader(program, fragment)
        GLES20.glLinkProgram(program)
        val linked = IntArray(1)
        GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, linked, 0)
        require(linked[0] != 0) { GLES20.glGetProgramInfoLog(program) }
        GLES20.glDeleteShader(vertex)
        GLES20.glDeleteShader(fragment)
        return program
    }

    companion object {
        private const val MODEL_VERTEX_SHADER = """
            uniform mat4 uMvp;
            uniform mat4 uModel;
            attribute vec3 aPosition;
            attribute vec3 aNormal;
            varying vec3 vNormal;
            varying vec3 vWorldPosition;
            void main() {
                vec4 world = uModel * vec4(aPosition, 1.0);
                vWorldPosition = world.xyz;
                vNormal = normalize(mat3(uModel) * aNormal);
                gl_Position = uMvp * vec4(aPosition, 1.0);
            }
        """

        private const val MODEL_FRAGMENT_SHADER = """
            precision mediump float;
            uniform vec4 uColor;
            varying vec3 vNormal;
            varying vec3 vWorldPosition;
            void main() {
                vec3 normal = normalize(vNormal);
                vec3 key = normalize(vec3(-0.45, 0.75, 0.85));
                vec3 fill = normalize(vec3(0.65, 0.15, 0.75));
                float diffuse = max(dot(normal, key), 0.0) * 0.78;
                float secondary = max(dot(normal, fill), 0.0) * 0.25;
                float rim = pow(1.0 - abs(normal.z), 2.0) * 0.30;
                float light = 0.28 + diffuse + secondary + rim;
                vec3 colour = uColor.rgb * light + vec3(0.035, 0.018, 0.004) * rim;
                gl_FragColor = vec4(colour, uColor.a);
            }
        """

        private const val MARKER_VERTEX_SHADER = """
            uniform mat4 uMvp;
            uniform float uPointSize;
            attribute vec3 aPosition;
            void main() {
                gl_Position = uMvp * vec4(aPosition, 1.0);
                gl_PointSize = uPointSize;
            }
        """

        private const val MARKER_FRAGMENT_SHADER = """
            precision mediump float;
            uniform vec4 uColor;
            uniform float uMode;
            void main() {
                float distanceFromCenter = distance(gl_PointCoord, vec2(0.5));
                float alpha;
                if (uMode < 0.5) {
                    alpha = 1.0 - smoothstep(0.05, 0.5, distanceFromCenter);
                } else if (uMode < 1.5) {
                    alpha = 1.0 - smoothstep(0.31, 0.49, distanceFromCenter);
                } else {
                    alpha = smoothstep(0.22, 0.34, distanceFromCenter) * (1.0 - smoothstep(0.40, 0.5, distanceFromCenter));
                }
                if (alpha <= 0.01) discard;
                gl_FragColor = vec4(uColor.rgb, uColor.a * alpha);
            }
        """
    }
}

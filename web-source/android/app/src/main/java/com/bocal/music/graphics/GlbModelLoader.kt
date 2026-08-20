package com.bocal.music.graphics

import android.content.res.AssetManager
import android.opengl.Matrix
import org.json.JSONArray
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.ShortBuffer
import kotlin.math.sqrt

data class ModelPrimitive(
    val vertices: FloatBuffer,
    val indices: ShortBuffer,
    val indexCount: Int,
    val materialRole: MaterialRole,
)

enum class MaterialRole { BODY, KEYWORK, CORK }

data class BronzeModel(
    val primitives: List<ModelPrimitive>,
    val centerX: Float,
    val centerY: Float,
    val centerZ: Float,
    val height: Float,
)

object GlbModelLoader {
    fun load(assets: AssetManager, assetPath: String): BronzeModel {
        val bytes = assets.open(assetPath).use { it.readBytes() }
        val source = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        require(source.int == GLB_MAGIC) { "Not a binary glTF file" }
        require(source.int == 2) { "Only glTF 2.0 is supported" }
        require(source.int <= bytes.size) { "Truncated glTF file" }

        val jsonLength = source.int
        require(source.int == JSON_CHUNK) { "The first glTF chunk must be JSON" }
        val jsonBytes = ByteArray(jsonLength)
        source.get(jsonBytes)
        val root = JSONObject(jsonBytes.toString(Charsets.UTF_8).trimEnd('\u0000', ' ', '\n', '\r', '\t'))

        val binaryLength = source.int
        require(source.int == BIN_CHUNK) { "The second glTF chunk must be binary" }
        val binaryStart = source.position()
        require(binaryStart + binaryLength <= bytes.size) { "Truncated glTF binary chunk" }

        val nodes = root.getJSONArray("nodes")
        val meshes = root.getJSONArray("meshes")
        val accessors = root.getJSONArray("accessors")
        val bufferViews = root.getJSONArray("bufferViews")
        val materials = root.optJSONArray("materials") ?: JSONArray()
        val output = mutableListOf<ModelPrimitive>()
        val bounds = floatArrayOf(
            Float.POSITIVE_INFINITY,
            Float.POSITIVE_INFINITY,
            Float.POSITIVE_INFINITY,
            Float.NEGATIVE_INFINITY,
            Float.NEGATIVE_INFINITY,
            Float.NEGATIVE_INFINITY,
        )

        fun decodeAccessor(accessorIndex: Int, expectedComponents: Int): DecodedAccessor {
            val accessor = accessors.getJSONObject(accessorIndex)
            val view = bufferViews.getJSONObject(accessor.getInt("bufferView"))
            val componentType = accessor.getInt("componentType")
            val count = accessor.getInt("count")
            val normalized = accessor.optBoolean("normalized", false)
            val componentSize = componentSize(componentType)
            val stride = view.optInt("byteStride", componentSize * expectedComponents)
            val start = binaryStart + view.optInt("byteOffset", 0) + accessor.optInt("byteOffset", 0)
            return DecodedAccessor(source, start, stride, count, componentType, normalized, expectedComponents)
        }

        fun materialRole(materialIndex: Int): MaterialRole {
            val name = materials.optJSONObject(materialIndex)?.optString("name")?.lowercase().orEmpty()
            return when {
                "leather" in name || "cork" in name -> MaterialRole.CORK
                "silver" in name || "wire" in name || "key" in name -> MaterialRole.KEYWORK
                else -> MaterialRole.BODY
            }
        }

        fun emitMesh(meshIndex: Int, world: FloatArray) {
            val primitives = meshes.getJSONObject(meshIndex).getJSONArray("primitives")
            for (primitiveIndex in 0 until primitives.length()) {
                val primitive = primitives.getJSONObject(primitiveIndex)
                require(primitive.optInt("mode", 4) == 4) { "Only triangle primitives are supported" }
                val attributes = primitive.getJSONObject("attributes")
                val positions = decodeAccessor(attributes.getInt("POSITION"), 3)
                val normals = decodeAccessor(attributes.getInt("NORMAL"), 3)
                require(positions.count == normals.count) { "Position and normal counts differ" }
                val interleaved = ByteBuffer.allocateDirect(positions.count * 6 * Float.SIZE_BYTES)
                    .order(ByteOrder.nativeOrder())
                    .asFloatBuffer()
                for (vertex in 0 until positions.count) {
                    val px = positions.value(vertex, 0)
                    val py = positions.value(vertex, 1)
                    val pz = positions.value(vertex, 2)
                    val tx = world[0] * px + world[4] * py + world[8] * pz + world[12]
                    val ty = world[1] * px + world[5] * py + world[9] * pz + world[13]
                    val tz = world[2] * px + world[6] * py + world[10] * pz + world[14]
                    bounds[0] = minOf(bounds[0], tx)
                    bounds[1] = minOf(bounds[1], ty)
                    bounds[2] = minOf(bounds[2], tz)
                    bounds[3] = maxOf(bounds[3], tx)
                    bounds[4] = maxOf(bounds[4], ty)
                    bounds[5] = maxOf(bounds[5], tz)

                    val nx0 = normals.value(vertex, 0)
                    val ny0 = normals.value(vertex, 1)
                    val nz0 = normals.value(vertex, 2)
                    var nx = world[0] * nx0 + world[4] * ny0 + world[8] * nz0
                    var ny = world[1] * nx0 + world[5] * ny0 + world[9] * nz0
                    var nz = world[2] * nx0 + world[6] * ny0 + world[10] * nz0
                    val length = sqrt(nx * nx + ny * ny + nz * nz).coerceAtLeast(0.00001f)
                    nx /= length
                    ny /= length
                    nz /= length
                    interleaved.put(tx).put(ty).put(tz).put(nx).put(ny).put(nz)
                }
                interleaved.position(0)

                val indicesAccessor = decodeAccessor(primitive.getInt("indices"), 1)
                require(indicesAccessor.componentType == UNSIGNED_SHORT) { "This optimized model must use 16-bit indices" }
                val indices = ByteBuffer.allocateDirect(indicesAccessor.count * Short.SIZE_BYTES)
                    .order(ByteOrder.nativeOrder())
                    .asShortBuffer()
                for (index in 0 until indicesAccessor.count) {
                    indices.put(indicesAccessor.rawUnsignedShort(index).toShort())
                }
                indices.position(0)
                output += ModelPrimitive(
                    vertices = interleaved,
                    indices = indices,
                    indexCount = indicesAccessor.count,
                    materialRole = materialRole(primitive.optInt("material", -1)),
                )
            }
        }

        fun visit(nodeIndex: Int, parent: FloatArray) {
            val node = nodes.getJSONObject(nodeIndex)
            val local = nodeMatrix(node)
            val world = FloatArray(16)
            Matrix.multiplyMM(world, 0, parent, 0, local, 0)
            if (node.has("mesh")) emitMesh(node.getInt("mesh"), world)
            val children = node.optJSONArray("children") ?: return
            for (childIndex in 0 until children.length()) visit(children.getInt(childIndex), world)
        }

        val identity = FloatArray(16).also { Matrix.setIdentityM(it, 0) }
        val sceneIndex = root.optInt("scene", 0)
        val sceneNodes = root.getJSONArray("scenes").getJSONObject(sceneIndex).getJSONArray("nodes")
        for (index in 0 until sceneNodes.length()) visit(sceneNodes.getInt(index), identity)
        require(output.isNotEmpty()) { "The glTF did not contain drawable primitives" }
        val height = (bounds[4] - bounds[1]).coerceAtLeast(0.001f)
        return BronzeModel(
            primitives = output,
            centerX = (bounds[0] + bounds[3]) / 2f,
            centerY = (bounds[1] + bounds[4]) / 2f,
            centerZ = (bounds[2] + bounds[5]) / 2f,
            height = height,
        )
    }

    private fun nodeMatrix(node: JSONObject): FloatArray {
        node.optJSONArray("matrix")?.let { matrix ->
            return FloatArray(16) { matrix.getDouble(it).toFloat() }
        }
        val translation = node.optJSONArray("translation") ?: JSONArray("[0,0,0]")
        val rotation = node.optJSONArray("rotation") ?: JSONArray("[0,0,0,1]")
        val scale = node.optJSONArray("scale") ?: JSONArray("[1,1,1]")
        val translationMatrix = FloatArray(16).also {
            Matrix.setIdentityM(it, 0)
            Matrix.translateM(it, 0, translation.getDouble(0).toFloat(), translation.getDouble(1).toFloat(), translation.getDouble(2).toFloat())
        }
        val rotationMatrix = quaternionMatrix(
            rotation.getDouble(0).toFloat(),
            rotation.getDouble(1).toFloat(),
            rotation.getDouble(2).toFloat(),
            rotation.getDouble(3).toFloat(),
        )
        val scaleMatrix = FloatArray(16).also {
            Matrix.setIdentityM(it, 0)
            Matrix.scaleM(it, 0, scale.getDouble(0).toFloat(), scale.getDouble(1).toFloat(), scale.getDouble(2).toFloat())
        }
        val translatedRotation = FloatArray(16)
        val output = FloatArray(16)
        Matrix.multiplyMM(translatedRotation, 0, translationMatrix, 0, rotationMatrix, 0)
        Matrix.multiplyMM(output, 0, translatedRotation, 0, scaleMatrix, 0)
        return output
    }

    private fun quaternionMatrix(x: Float, y: Float, z: Float, w: Float): FloatArray = floatArrayOf(
        1f - 2f * y * y - 2f * z * z,
        2f * x * y + 2f * z * w,
        2f * x * z - 2f * y * w,
        0f,
        2f * x * y - 2f * z * w,
        1f - 2f * x * x - 2f * z * z,
        2f * y * z + 2f * x * w,
        0f,
        2f * x * z + 2f * y * w,
        2f * y * z - 2f * x * w,
        1f - 2f * x * x - 2f * y * y,
        0f,
        0f,
        0f,
        0f,
        1f,
    )

    private fun componentSize(componentType: Int) = when (componentType) {
        SHORT, UNSIGNED_SHORT -> 2
        FLOAT -> 4
        else -> error("Unsupported glTF component type: $componentType")
    }

    private data class DecodedAccessor(
        val source: ByteBuffer,
        val start: Int,
        val stride: Int,
        val count: Int,
        val componentType: Int,
        val normalized: Boolean,
        val components: Int,
    ) {
        fun value(index: Int, component: Int): Float {
            require(component < components)
            val offset = start + index * stride + component * GlbModelLoader.componentSize(componentType)
            return when (componentType) {
                SHORT -> {
                    val raw = source.getShort(offset).toInt()
                    if (normalized) (raw / 32767f).coerceAtLeast(-1f) else raw.toFloat()
                }
                UNSIGNED_SHORT -> {
                    val raw = source.getShort(offset).toInt() and 0xffff
                    if (normalized) raw / 65535f else raw.toFloat()
                }
                FLOAT -> source.getFloat(offset)
                else -> error("Unsupported glTF component type: $componentType")
            }
        }

        fun rawUnsignedShort(index: Int): Int {
            require(componentType == UNSIGNED_SHORT)
            return source.getShort(start + index * stride).toInt() and 0xffff
        }
    }

    private const val GLB_MAGIC = 0x46546C67
    private const val JSON_CHUNK = 0x4E4F534A
    private const val BIN_CHUNK = 0x004E4942
    private const val SHORT = 5122
    private const val UNSIGNED_SHORT = 5123
    private const val FLOAT = 5126
}

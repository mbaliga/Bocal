package com.bocal.music.widget

/**
 * A small, strict JSON reader for the widget snapshot the web app publishes.
 *
 * `org.json` ships with Android but is only a stub in plain JVM unit tests,
 * and the app takes no JSON library, so the snapshot is read here. Objects
 * become [Map]s, arrays [List]s, numbers [Double]s; anything that is not
 * exactly one JSON value (trailing text, comments, single quotes, NaN, a
 * nesting deeper than [MAX_DEPTH]) is rejected with [ParseException].
 */
object MiniJson {
    const val MAX_DEPTH = 16

    class ParseException(message: String) : Exception(message)

    fun parse(text: String): Any? {
        val reader = Reader(text)
        reader.skipWhitespace()
        val value = reader.readValue(0)
        reader.skipWhitespace()
        if (!reader.atEnd()) throw ParseException("trailing text at ${reader.position}")
        return value
    }

    private class Reader(private val text: String) {
        var position = 0
            private set

        fun atEnd() = position >= text.length

        fun skipWhitespace() {
            while (!atEnd() && text[position] in " \t\r\n") position++
        }

        fun readValue(depth: Int): Any? {
            if (depth > MAX_DEPTH) throw ParseException("nested too deeply")
            if (atEnd()) throw ParseException("unexpected end")
            return when (val char = text[position]) {
                '{' -> readObject(depth + 1)
                '[' -> readArray(depth + 1)
                '"' -> readString()
                't' -> readLiteral("true", true)
                'f' -> readLiteral("false", false)
                'n' -> readLiteral("null", null)
                else -> if (char == '-' || char in '0'..'9') readNumber() else throw ParseException("unexpected '$char' at $position")
            }
        }

        private fun readLiteral(word: String, value: Any?): Any? {
            if (!text.startsWith(word, position)) throw ParseException("bad literal at $position")
            position += word.length
            return value
        }

        private fun expect(char: Char) {
            if (atEnd() || text[position] != char) throw ParseException("expected '$char' at $position")
            position++
        }

        private fun readObject(depth: Int): Map<String, Any?> {
            expect('{')
            val result = LinkedHashMap<String, Any?>()
            skipWhitespace()
            if (!atEnd() && text[position] == '}') {
                position++
                return result
            }
            while (true) {
                skipWhitespace()
                if (atEnd() || text[position] != '"') throw ParseException("expected a key at $position")
                val key = readString()
                if (result.containsKey(key)) throw ParseException("duplicate key '$key'")
                skipWhitespace()
                expect(':')
                skipWhitespace()
                result[key] = readValue(depth)
                skipWhitespace()
                if (atEnd()) throw ParseException("unterminated object")
                when (text[position++]) {
                    ',' -> continue
                    '}' -> return result
                    else -> throw ParseException("expected ',' or '}' at ${position - 1}")
                }
            }
        }

        private fun readArray(depth: Int): List<Any?> {
            expect('[')
            val result = ArrayList<Any?>()
            skipWhitespace()
            if (!atEnd() && text[position] == ']') {
                position++
                return result
            }
            while (true) {
                skipWhitespace()
                result.add(readValue(depth))
                skipWhitespace()
                if (atEnd()) throw ParseException("unterminated array")
                when (text[position++]) {
                    ',' -> continue
                    ']' -> return result
                    else -> throw ParseException("expected ',' or ']' at ${position - 1}")
                }
            }
        }

        private fun readString(): String {
            expect('"')
            val builder = StringBuilder()
            while (true) {
                if (atEnd()) throw ParseException("unterminated string")
                val char = text[position++]
                when {
                    char == '"' -> return builder.toString()
                    char == '\\' -> builder.append(readEscape())
                    char < ' ' -> throw ParseException("raw control character in string")
                    else -> builder.append(char)
                }
            }
        }

        private fun readEscape(): Char {
            if (atEnd()) throw ParseException("unterminated escape")
            return when (val char = text[position++]) {
                '"' -> '"'
                '\\' -> '\\'
                '/' -> '/'
                'b' -> '\b'
                'f' -> '\u000C'
                'n' -> '\n'
                'r' -> '\r'
                't' -> '\t'
                'u' -> {
                    if (position + 4 > text.length) throw ParseException("short unicode escape")
                    val hex = text.substring(position, position + 4)
                    position += 4
                    hex.toIntOrNull(16)?.toChar() ?: throw ParseException("bad unicode escape")
                }
                else -> throw ParseException("bad escape '\\$char'")
            }
        }

        private fun readNumber(): Double {
            val start = position
            if (text[position] == '-') position++
            if (atEnd()) throw ParseException("bad number")
            if (text[position] == '0') {
                position++
            } else if (text[position] in '1'..'9') {
                while (!atEnd() && text[position] in '0'..'9') position++
            } else {
                throw ParseException("bad number at $start")
            }
            if (!atEnd() && text[position] == '.') {
                position++
                val digits = position
                while (!atEnd() && text[position] in '0'..'9') position++
                if (position == digits) throw ParseException("bad fraction at $start")
            }
            if (!atEnd() && (text[position] == 'e' || text[position] == 'E')) {
                position++
                if (!atEnd() && (text[position] == '+' || text[position] == '-')) position++
                val digits = position
                while (!atEnd() && text[position] in '0'..'9') position++
                if (position == digits) throw ParseException("bad exponent at $start")
            }
            val value = text.substring(start, position).toDouble()
            if (!value.isFinite()) throw ParseException("number out of range at $start")
            return value
        }
    }
}

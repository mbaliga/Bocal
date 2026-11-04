package com.bocal.music.widget

import org.w3c.dom.Element
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory

/** Reads the widget providers' `res/xml/widget_*_info.xml` definitions, so tests check the real files. */
object ProviderXml {
    private const val ANDROID_NS = "http://schemas.android.com/apk/res/android"

    private fun fileName(kind: WidgetKind): String = when (kind) {
        WidgetKind.THIS_WEEK -> "widget_week_info.xml"
        WidgetKind.TUNE -> "widget_tune_info.xml"
        WidgetKind.STUDYING -> "widget_studying_info.xml"
        WidgetKind.LOG -> "widget_log_info.xml"
        WidgetKind.PULSE -> "widget_pulse_info.xml"
        WidgetKind.INSTRUMENT -> "widget_instrument_info.xml"
    }

    /** Gradle runs unit tests from the module directory; the second path covers a run from the Gradle root. */
    private fun xmlDirectory(): File = listOf(File("src/main/res/xml"), File("app/src/main/res/xml"))
        .firstOrNull { it.isDirectory }
        ?: error("res/xml not found from ${File(".").absolutePath}")

    private fun root(kind: WidgetKind): Element {
        val factory = DocumentBuilderFactory.newInstance().apply { isNamespaceAware = true }
        return factory.newDocumentBuilder().parse(File(xmlDirectory(), fileName(kind))).documentElement
    }

    private fun dp(element: Element, attribute: String): Int {
        val value = element.getAttributeNS(ANDROID_NS, attribute)
        require(value.endsWith("dp")) { "android:$attribute=\"$value\" is not in dp" }
        return value.removeSuffix("dp").toInt()
    }

    fun minSize(kind: WidgetKind): Pair<Int, Int> {
        val provider = root(kind)
        return dp(provider, "minWidth") to dp(provider, "minHeight")
    }
}

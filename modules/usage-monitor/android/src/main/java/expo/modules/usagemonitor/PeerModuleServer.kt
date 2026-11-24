package expo.modules.usagemonitor

import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.atomic.AtomicReference

/**
 * Lightweight local Wi-Fi / hotspot HTTP server that lets a teacher's phone
 * serve approved class modules directly to students on the same network,
 * eliminating heavy cloud file storage while keeping modules offline-ready.
 */
object PeerModuleServer {
  private val payloadByClass = AtomicReference<Map<String, String>>(emptyMap())

  @Volatile private var serverSocket: ServerSocket? = null
  @Volatile private var worker: Thread? = null
  @Volatile private var port: Int = 0

  @Synchronized
  fun updateAndEnsureRunning(modulesByClassJson: String): String {
    val parsed = runCatching { JSONObject(modulesByClassJson) }.getOrNull() ?: return ""
    val next = HashMap<String, String>()
    val keys = parsed.keys()
    while (keys.hasNext()) {
      val k = keys.next()
      next[k] = parsed.optJSONArray(k)?.toString() ?: "[]"
    }
    payloadByClass.set(next)

    if (serverSocket == null || serverSocket?.isClosed == true) {
      runCatching {
        val sock = ServerSocket(0)
        serverSocket = sock
        port = sock.localPort
        val t = Thread({
          while (!sock.isClosed) {
            val client = runCatching { sock.accept() }.getOrNull() ?: break
            Thread { handleClient(client) }.apply { isDaemon = true }.start()
          }
        }, "learnshift-peer-http").apply { isDaemon = true }
        worker = t
        t.start()
      }.onFailure {
        return ""
      }
    }

    val ip = findLanIpv4() ?: return ""
    return if (port > 0) "http://$ip:$port" else ""
  }

  @Synchronized
  fun stop() {
    runCatching { serverSocket?.close() }
    serverSocket = null
    worker = null
    port = 0
  }

  fun baseUrl(): String {
    val p = port
    if (p <= 0 || serverSocket == null || serverSocket?.isClosed == true) return ""
    val ip = findLanIpv4() ?: return ""
    return "http://$ip:$p"
  }

  private fun handleClient(socket: Socket) {
    socket.use { sock ->
      runCatching {
        sock.soTimeout = 3_000
        val reader = BufferedReader(InputStreamReader(sock.getInputStream(), Charsets.UTF_8))
        val requestLine = reader.readLine() ?: return
        val parts = requestLine.split(' ')
        val rawPath = if (parts.size >= 2) parts[1].substringBefore('?') else "/"

        val body: String
        val status: String
        val map = payloadByClass.get()
        if (rawPath.startsWith("/modules/")) {
          val classId = rawPath.removePrefix("/modules/").removeSuffix(".json")
          body = map[classId] ?: "[]"
          status = "200 OK"
        } else if (rawPath == "/modules" || rawPath == "/health") {
          val root = JSONObject()
          for ((k, v) in map) root.put(k, runCatching { org.json.JSONArray(v) }.getOrDefault(org.json.JSONArray()))
          body = root.toString()
          status = "200 OK"
        } else {
          body = "{}"
          status = "404 Not Found"
        }

        val bytes = body.toByteArray(Charsets.UTF_8)
        val headers = buildString {
          append("HTTP/1.1 $status\r\n")
          append("Content-Type: application/json; charset=utf-8\r\n")
          append("Access-Control-Allow-Origin: *\r\n")
          append("Content-Length: ${bytes.size}\r\n")
          append("Connection: close\r\n\r\n")
        }
        val out = sock.getOutputStream()
        out.write(headers.toByteArray(Charsets.US_ASCII))
        out.write(bytes)
        out.flush()
      }
    }
  }

  private fun findLanIpv4(): String? = runCatching {
    val ifaces = NetworkInterface.getNetworkInterfaces() ?: return null
    var fallback: String? = null
    while (ifaces.hasMoreElements()) {
      val iface = ifaces.nextElement()
      if (!iface.isUp || iface.isLoopback || iface.isVirtual) continue
      val addrs = iface.inetAddresses
      while (addrs.hasMoreElements()) {
        val addr = addrs.nextElement()
        if (addr !is Inet4Address || addr.isLoopbackAddress || addr.isLinkLocalAddress) continue
        val host = addr.hostAddress ?: continue
        if (addr.isSiteLocalAddress) return host
        if (fallback == null) fallback = host
      }
    }
    fallback
  }.getOrNull()
}

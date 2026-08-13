import AppKit
import Foundation

func writeIcon(to path: String, color: NSColor) throws {
    let size = NSSize(width: 96, height: 96)
    let image = NSImage(size: size)
    image.lockFocus()

    NSColor.clear.setFill()
    NSBezierPath(rect: NSRect(origin: .zero, size: size)).fill()

    color.setFill()

    let squareSize: CGFloat = 24
    let gap: CGFloat = 10
    let start: CGFloat = 19
    let radius: CGFloat = 6

    for row in 0..<2 {
        for col in 0..<2 {
            let x = start + CGFloat(col) * (squareSize + gap)
            let y = start + CGFloat(row) * (squareSize + gap)
            let rect = NSRect(x: x, y: y, width: squareSize, height: squareSize)
            let path = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
            path.fill()
        }
    }

    image.unlockFocus()

    guard
        let tiffData = image.tiffRepresentation,
        let bitmap = NSBitmapImageRep(data: tiffData),
        let pngData = bitmap.representation(using: .png, properties: [:])
    else {
        throw NSError(domain: "gen-scenes-icon", code: 1)
    }

    try pngData.write(to: URL(fileURLWithPath: path))
}

do {
    try writeIcon(
        to: "static/tabbar/scenes-grid.png",
        color: NSColor(calibratedWhite: 0.60, alpha: 1)
    )
    try writeIcon(
        to: "static/tabbar/scenes-grid-active.png",
        color: NSColor(calibratedWhite: 0.0, alpha: 1)
    )
    print("generated")
} catch {
    fputs("Failed: \(error)\n", stderr)
    exit(1)
}

/**
 * SVG text as a PNG. SubSectorSpec 6.2.
 *
 * The browser does the drawing: an image built from the SVG, painted onto a
 * canvas, handed back as a blob. That is why it lives here rather than beside
 * the SVG itself - the SVG is text and can be tested anywhere, and this needs a
 * document.
 *
 * Drawn at twice the size, because a chart is read by zooming into it and a hex
 * number at eleven pixels does not survive being printed.
 */
export async function svgToPng(svg: string, scale = 2): Promise<Blob> {
  const size = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  const width = Math.round(Number(size?.[1] ?? 800) * scale);
  const height = Math.round(Number(size?.[2] ?? 1000) * scale);

  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.width = width;
    image.height = height;
    await new Promise<void>((done, fail) => {
      image.addEventListener("load", () => done());
      image.addEventListener("error", () => fail(new Error("The map could not be drawn.")));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const paper = canvas.getContext("2d");
    if (paper === null) throw new Error("This browser cannot draw to a canvas.");
    paper.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((done, fail) => {
      canvas.toBlob((blob) => {
        if (blob === null) fail(new Error("The map could not be written as a PNG."));
        else done(blob);
      }, "image/png");
    });
  } finally {
    // On a later turn: revoking it while the image is still reading beats the
    // read, and the read is what the URL was for.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

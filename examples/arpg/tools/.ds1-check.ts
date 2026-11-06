import fs from 'node:fs'
import { parseDs1 } from '@rasenjs/assets'

for (const f of ['/tmp/d2r-all/global/tiles/garden/colossalsummit/colossalsummit.ds1', '/tmp/d2r-all/global/tiles/act1/outdoors/trees.ds1']) {
  const bytes = new Uint8Array(fs.readFileSync(f))
  const map = parseDs1(bytes)
  const cells = map.width * map.height
  console.log(`=== ${f.split('/').pop()} v${map.version} ${map.width}x${map.height} cells=${cells} act=${map.act} tagType=${map.tagType}`)
  console.log('  tileFiles:', map.tileFiles.length, 'walls:', map.walls.length, 'floors:', map.floors.length, 'tag:', !!map.tag, 'objects:', map.objects.length, 'groups:', map.groups.length, 'paths:', map.paths.length)
  console.log('  truncated:', map.truncated, 'bytesRead:', map.bytesRead, 'size:', bytes.length, 'trailing:', map.trailingBytes)
  map.walls.forEach((w) => {
    let cellsNz = 0
    let orientNz = 0
    for (let i = 0; i < cells; i++) {
      if (w.cells[i]) cellsNz++
      if (w.orientations[i]) orientNz++
    }
    console.log(`  wall${w.index}: occupied=${cellsNz} orientations=${orientNz} match=${cellsNz === orientNz}`)
  })
  map.floors.forEach((fl) => {
    let nz = 0
    for (let i = 0; i < cells; i++) if (fl.cells[i]) nz++
    console.log(`  floor${fl.index}: occupied=${nz}/${cells}`)
  })
  console.log('  first objects:', JSON.stringify(map.objects.slice(0, 3)))
  console.log('  first paths:', JSON.stringify(map.paths.slice(0, 1)))
}

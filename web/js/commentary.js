// Developer commentary. Little numbered nodes on the page; click one and I explain why that part
// of Pip is the way it is. Borrowed shamelessly from the commentary tracks in Valve's games.
import { BOUNDS } from './world.js';

const NODES = [
  {
    view: 'face', left: 50, top: 80,
    title: 'Two round screens, not one rectangle',
    text: `One wide OLED would have been simpler to wire. But a face with one screen reads as a phone
      taped to a box. Two 1.28" GC9A01 rounds read as eyes before you've even seen them move, and
      they cost a couple of dollars each. The eye renderer draws at exactly 240×240 per eye, so the
      same code can push pixels to the real screens later.`,
  },
  {
    view: 'face', left: 92, top: 86,
    title: 'Beeps first, words second',
    text: `Pip has a whole beep vocabulary and only a handful of sentences. Beeps don't need
      translating, they never sound uncanny, and every mood fits in under a second. Words are for
      the few times it really has something to say, like being stuck. If it talked all the time,
      you'd mute it by day two.`,
  },
  {
    view: 'face', left: 8, top: 86,
    title: 'Leave at 90, come home at 25',
    text: `25% is enough to cross this apartment twice even if the first route home is blocked.
      Leaving at 90% instead of waiting for 100 is a Li-ion thing: the last stretch of a charge is
      the slow constant-voltage part, so waiting for the final 10% costs a lot of time for very
      little range.`,
  },
  {
    view: 'world', x: 3.55, y: -0.5,
    title: 'A dock you can find with a laser',
    text: `No IR beacons, no camera, no AprilTag. The dock is just a flat face 30 cm wide sticking out
      from the wall, which is exactly the kind of thing a 2D lidar is good at seeing. Pip fits a
      line to the points with RANSAC (so the wall corners next to it don't drag the fit) and only
      believes it if the line is the right width.`,
  },
  {
    view: 'world', x: 3.55, y: -1.55,
    title: 'The last 17 centimetres',
    text: `The lidar can't measure anything closer than 12 cm, and the contacts need about 1 cm of
      accuracy. So once Pip is lined up 28 cm out, it stops looking and creeps straight in on wheel
      odometry. If the battery doesn't report charging within 3 seconds, it backs off 30 cm and
      tries again. Three misses and it asks for help.`,
  },
  {
    view: 'world', x: -3.25, y: 0.55,
    title: "What the lidar can't see",
    text: `The scan plane is 15.5 cm off the floor. Anything lower is invisible to it: cables, rug
      edges, a shoe, the top of a staircase. That's why the real build has two IR cliff sensors and a
      bump switch on the front. In here the furniture is solid blocks, which is a lie your living
      room won't tell.`,
  },
  {
    view: 'map', x: -1.4, y: 1.6,
    title: 'Go where the map ends',
    text: `The blue cells are frontiers: known floor touching the unknown. Pip picks a big one that's
      close, drives there, and lets the lidar fill in what's behind it. A random walk would find the
      bedroom eventually. Frontiers find it on purpose, and they also tell Pip when it's done: no
      frontiers left means the whole place is mapped.`,
  },
  {
    view: 'map', x: 2.75, y: -1.55,
    title: 'Why stop 60 cm short',
    text: `The path planner gets Pip within about 15 cm of a goal, which is fine for "go to the
      kitchen" and useless for lining up with a pair of contacts. So it only drives to a staging
      spot 60 cm in front of the dock, then the docking code takes over with the lidar.`,
  },
  {
    view: 'map', x: -3.55, y: -2.55,
    title: 'This page cheats a little',
    text: `To keep it fast in a browser, this version knows exactly where Pip is. The ROS 2 version
      in the repo doesn't. It has to work that out from the scans with slam_toolbox, and drift
      matters there. Same mapping, frontiers, A*, docking and moods otherwise, just ported to
      JavaScript.`,
  },
];

export function setupCommentary(onToggle) {
  const cards = [];
  let open = null;

  function close() {
    if (open) { open.card.hidden = true; open.node.setAttribute('aria-expanded', 'false'); open = null; }
  }

  NODES.forEach((n, i) => {
    const host = document.querySelector(`[data-commentary="${n.view}"]`);
    const node = document.createElement('button');
    node.className = 'node';
    node.textContent = String(i + 1);
    node.setAttribute('aria-expanded', 'false');
    node.setAttribute('aria-label', `Commentary ${i + 1}: ${n.title}`);
    const left = n.left ?? ((n.x - BOUNDS.xmin) / (BOUNDS.xmax - BOUNDS.xmin)) * 100;
    const top = n.top ?? ((BOUNDS.ymax - n.y) / (BOUNDS.ymax - BOUNDS.ymin)) * 100;
    node.style.left = `${left}%`;
    node.style.top = `${top}%`;

    const card = document.createElement('div');
    card.className = 'note px';
    card.hidden = true;
    card.innerHTML = `<p class="note-title"><span>${i + 1}</span>${n.title}</p><p>${n.text.replace(/\s+/g, ' ')}</p>`;
    card.classList.toggle('above', top > 55);
    card.style.top = `${top}%`;

    node.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = open && open.node === node;
      close();
      if (!wasOpen) {
        card.hidden = false;
        // Keep the note inside its panel, whatever the screen width.
        const hostW = host.clientWidth;
        const half = card.offsetWidth / 2;
        const want = (left / 100) * hostW;
        card.style.left = `${Math.min(Math.max(want, half + 4), hostW - half - 4)}px`;
        node.setAttribute('aria-expanded', 'true');
        open = { node, card };
        onToggle?.(i);
      }
    });
    card.addEventListener('click', (e) => e.stopPropagation());
    host.append(node, card);
    cards.push(node);
  });

  document.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  return {
    setVisible(on) {
      document.body.classList.toggle('no-commentary', !on);
      if (!on) close();
    },
  };
}
